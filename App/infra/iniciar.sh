#!/usr/bin/env bash
#
# Arranca HEXACORE completo con una sola orden.
#
#   ./iniciar.sh                          todo en este computador
#   ./iniciar.sh --replicas 2             con 2 instancias del servicio de Entradas
#   ./iniciar.sh --rol datos              solo la capa de datos (computador A)
#   ./iniciar.sh --rol servicios --datos 192.168.1.20
#                                         servicios y gateway apuntando al A (computador B)
#   ./iniciar.sh --registro develop       desde las imágenes que publicó el CD
#   ./iniciar.sh --datos-demo sql         datos de ejemplo sin necesitar Node
#   ./iniciar.sh --parar                  baja todo, conservando los datos
#
# Por qué existe: el atributo de **desplegabilidad** exige que el sistema
# completo se levante desde un único script en un computador, y que pueda estar
# repartido en dos o más. Las dos cosas se hacen aquí.
#
# Lo que NO hace: instalar Docker, ni construir la app móvil. Tampoco borra
# datos: para eso está `docker compose down -v`, a propósito fuera de este
# script.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
RAIZ="$(cd ../.. && pwd)"

ROL="todo"
DATOS=""
REPLICAS=1
DEMO="si"
PARAR="no"
# Cómo poblar los datos de ejemplo:
#   auto  las semillas con npm si hay Node; si no, los volcados SQL
#   sql   siempre los volcados (no necesita Node)
#   npm   siempre las semillas
DATOS_DEMO="auto"
# Etiqueta a desplegar desde el registro (develop, main, latest, sha-XXXXXXX).
# Vacío = compilar aquí, que es lo normal mientras se desarrolla.
REGISTRO=""

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$*"; }

uso() {
  sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rol)       ROL="${2:-}"; shift 2 ;;
    --datos)     DATOS="${2:-}"; shift 2 ;;
    --replicas)  REPLICAS="${2:-1}"; shift 2 ;;
    --registro)  REGISTRO="${2:-develop}"; shift 2 ;;
    --datos-demo) DATOS_DEMO="${2:-auto}"; shift 2 ;;
    --sin-demo)  DEMO="no"; shift ;;
    --parar)     PARAR="si"; shift ;;
    -h|--help)   uso 0 ;;
    *)           rojo "Opción desconocida: $1"; uso 1 ;;
  esac
done

case "$ROL" in
  todo|datos|servicios) ;;
  *) rojo "El rol debe ser: todo, datos o servicios"; exit 1 ;;
esac

# --- Comprobaciones previas -------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  rojo "Docker no está instalado o no está en el PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  rojo "Docker está instalado pero no responde. ¿Está abierto Docker Desktop?"
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.yml)

if [[ -n "$DATOS" ]]; then
  # La capa de datos vive en otra máquina: se exportan los nombres que el
  # compose lee, y se quitan las dependencias locales.
  export HOST_POSTGRES="$DATOS" HOST_REDIS="$DATOS" HOST_RABBIT="$DATOS"
  export HOST_CORREO="$DATOS" HOST_PASARELA="$DATOS"
  export PUERTO_REDIS=6380      # en el anfitrión Redis se publica en el 6380
  COMPOSE+=(-f docker-compose.remoto.yml)
fi

if [[ -n "$REGISTRO" ]]; then
  # Nada se compila: se bajan las imágenes que publicó el pipeline de entrega
  # continua. Es lo que hace que desplegar en otra máquina sean segundos.
  export HEXACORE_ETIQUETA="$REGISTRO"
  COMPOSE+=(-f docker-compose.registro.yml)
fi

if [[ "$REPLICAS" -gt 1 ]]; then
  # Dos contenedores no pueden publicar el mismo puerto: el override lo quita.
  COMPOSE+=(-f docker-compose.escalado.yml)
fi

if [[ "$PARAR" == "si" ]]; then
  titulo "Parando HEXACORE (los datos se conservan)"
  "${COMPOSE[@]}" --profile servicios down
  verde "Listo. Para borrar también los datos: docker compose down -v"
  exit 0
fi

# --- Arranque ---------------------------------------------------------------

# Solo se compila cuando NO se despliega desde el registro.
CONSTRUIR="--build"
[[ -n "$REGISTRO" ]] && CONSTRUIR="--pull always"

titulo "HEXACORE — arranque ($ROL)"
[[ -n "$REGISTRO" ]] && gris "  Imágenes publicadas, etiqueta: $REGISTRO"
[[ -n "$DATOS" ]] && gris "  Capa de datos remota: $DATOS"
[[ "$REPLICAS" -gt 1 ]] && gris "  Réplicas del servicio de Entradas: $REPLICAS"

case "$ROL" in
  datos)
    gris "  Levantando PostgreSQL, Redis, RabbitMQ y los sistemas externos simulados"
    "${COMPOSE[@]}" up -d
    ;;
  servicios)
    if [[ -z "$DATOS" ]]; then
      rojo "El rol 'servicios' necesita --datos <IP del computador con la capa de datos>"
      exit 1
    fi
    gris "  Levantando los microservicios y el API Gateway"
    "${COMPOSE[@]}" --profile servicios up -d $CONSTRUIR \
      --scale entradas-mercado-secundario="$REPLICAS" \
      administracion entradas-mercado-secundario eventos-emergencias api-gateway \
      portal-web-cliente
    ;;
  todo)
    gris "  Levantando la capa de datos, los microservicios y el API Gateway"
    "${COMPOSE[@]}" --profile servicios up -d $CONSTRUIR \
      --scale entradas-mercado-secundario="$REPLICAS"
    ;;
esac

# --- Esperar a que todo esté sano -------------------------------------------

esperar_sano() {
  local nombre="$1" limite="${2:-120}" transcurrido=0
  while (( transcurrido < limite )); do
    local estado
    # Un contenedor sin sonda declarada devuelve vacío: en ese caso basta con
    # que esté corriendo. Antes esto se tomaba por "no existe" y el arranque
    # se abortaba con todo el sistema ya en pie.
    estado="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$nombre" 2>/dev/null || echo ausente)"
    [[ "$estado" == "healthy" || "$estado" == "running" ]] && return 0
    [[ "$estado" == "ausente" ]] && return 1
    sleep 2
    transcurrido=$(( transcurrido + 2 ))
  done
  return 1
}

if [[ "$ROL" != "datos" ]]; then
  titulo "Esperando a que los servicios respondan"
  for contenedor in hexacore-administracion hexacore-logistica hexacore-gateway hexacore-portal; do
    if esperar_sano "$contenedor"; then
      verde "  $contenedor listo"
    else
      rojo "  $contenedor no llegó a estar sano. Mira: docker logs $contenedor"
      exit 1
    fi
  done
fi

# --- Datos de ejemplo -------------------------------------------------------

sembrar() {
  local servicio="$1" tarea="${2:-semilla}" carpeta="$RAIZ/App/services/$1"
  if [[ ! -d "$carpeta/node_modules" ]]; then
    gris "  $servicio: sin node_modules, se omite la semilla (npm install para tenerla)"
    return
  fi
  if (cd "$carpeta" && npm run "$tarea" >/dev/null 2>&1); then
    verde "  $servicio: datos de ejemplo listos"
  else
    gris "  $servicio: la semilla falló, se continúa (correr a mano: npm run semilla)"
  fi
}

# Carga los volcados SQL en PostgreSQL. No necesita Node ni el código fuente:
# es lo que permite levantar el sistema con datos usables en una máquina que
# solo tiene Docker.
cargar_volcados() {
  local contenedor="hexacore-postgres"
  if [[ -n "$DATOS" ]]; then
    gris "  La base está en otra máquina; carga los volcados allí"
    return
  fi
  if ! docker ps --format '{{.Names}}' | grep -q "^${contenedor}$"; then
    gris "  No encuentro el contenedor de PostgreSQL, se omiten los datos"
    return
  fi
  for base in administracion entradas_mercado_secundario eventos_emergencias; do
    local archivo="datos-demo/$base.sql"
    if [[ ! -f "$archivo" ]]; then
      gris "  falta $archivo (regenéralo con ./exportar-datos-demo.sh)"
      continue
    fi
    if docker exec -i "$contenedor" psql --quiet --username=hexacore \
         --dbname="$base" -v ON_ERROR_STOP=0 < "$archivo" >/dev/null 2>&1; then
      verde "  $base: datos cargados desde el volcado"
    else
      gris "  $base: el volcado dio avisos, revisa con psql si algo falta"
    fi
  done
}

if [[ "$DEMO" == "si" && "$ROL" != "datos" ]]; then
  titulo "Datos de ejemplo"

  metodo="$DATOS_DEMO"
  if [[ "$metodo" == "auto" ]]; then
    # Con Node se usan las semillas, que son la fuente de verdad. Sin Node
    # —una máquina que solo tiene Docker— se cargan los volcados.
    if command -v npm >/dev/null 2>&1 && [[ -d "$RAIZ/App/services/administracion/node_modules" ]]; then
      metodo="npm"
    else
      metodo="sql"
    fi
  fi

  if [[ "$metodo" == "npm" ]]; then
    sembrar administracion
    sembrar entradas-mercado-secundario
    # La de logística va después de la de administración a propósito: da de alta
    # a cada empleado sobre la cuenta que aquella acaba de crear.
    sembrar eventos-emergencias seed
  else
    gris "  Sin Node disponible: cargando los volcados SQL"
    cargar_volcados
  fi
fi

# --- Resumen ----------------------------------------------------------------

IP_LOCAL="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"

titulo "HEXACORE en marcha"

if [[ "$ROL" == "datos" ]]; then
  cat <<FIN
  Capa de datos lista en este computador ($IP_LOCAL):

    PostgreSQL   $IP_LOCAL:5432       RabbitMQ   $IP_LOCAL:5672 (consola :15672)
    Redis        $IP_LOCAL:6380       Correo     $IP_LOCAL:3098
    Pasarela     $IP_LOCAL:3099

  En el otro computador:

    ./iniciar.sh --rol servicios --datos $IP_LOCAL
FIN
else
  cat <<FIN
  Único punto de entrada al backend (API Gateway):

    http://$IP_LOCAL:8080/api/v1

  Cuentas de ejemplo (contraseña: hexacore2026)

    cliente@hexacore.com      Cliente
    personal@hexacore.com     Personal
    jefepersonal@hexacore.com Personal (jefe)
    admin@hexacore.com        Administrador

  Portal web de clientes (ya levantado):

    http://$IP_LOCAL:4200

  App móvil — se instala en un dispositivo, no la levanta este script:

    cd App/frontend/app-movil && flutter run --dart-define=HEXACORE_HOST=$IP_LOCAL

  Comprobar que todo responde:

    curl -s http://localhost:8080/api/v1/salud
    python3 App/gateway/pruebas/gateway.py
FIN
fi

echo
gris "  Estado:   docker compose -f App/infra/docker-compose.yml --profile servicios ps"
gris "  Parar:    ./iniciar.sh --parar"
