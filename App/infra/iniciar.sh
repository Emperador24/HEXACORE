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
#   ./iniciar.sh --datos-demo npm         semillas explícitas, solo instalación vacía
#   ./iniciar.sh --parar                  baja todo, conservando los datos
#
# Por qué existe: el atributo de **desplegabilidad** exige que el sistema
# completo se levante desde un único script en un computador, y que pueda estar
# repartido en dos o más. Las dos cosas se hacen aquí.
#
# Prepara ocho esquemas mediante una tarea única antes de habilitar aplicaciones.
# Los datos demo requieren petición explícita y una instalación vacía; no forman
# parte de una actualización ni de la migración de datos existentes.
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
DEMO="no"
PARAR="no"
# Las semillas destructivas requieren --datos-demo npm y una base vacía.
DATOS_DEMO="npm"
# Etiqueta a desplegar desde el registro (develop, main, latest, sha-<SHA40>).
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
    --datos-demo) DATOS_DEMO="${2:-npm}"; DEMO="si"; shift 2 ;;
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

# Este script no realiza el corte de las ocho bases anteriores.
if [[ -z "$DATOS" ]] && docker ps --format '{{.Names}}' | grep -qx hexacore-postgres; then
  ANTERIORES="$(docker exec hexacore-postgres psql -U hexacore -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname IN ('administracion','pedidos','entradas_mercado_secundario','eventos_emergencias','catalogo','postventa','acceso_qr','pagos')")"
  if [[ "$ANTERIORES" != "0" ]]; then
    rojo "Instalación anterior detectada. Ejecuta el procedimiento autorizado de corte y conciliación; iniciar.sh no lo automatiza."
    exit 1
  fi
fi
if [[ "$DEMO" == "si" && "$DATOS_DEMO" != "npm" ]]; then
  rojo "Los volcados por bases antiguas están retirados. Usa --datos-demo npm solo en una instalación vacía."
  exit 1
fi

# Un servicio retirado puede seguir como huérfano del mismo proyecto Compose.
# No arrancar otro consumidor sobre cuentas.correos hasta detener el anterior.
if [[ "$ROL" != "datos" ]]; then
  SERVICIOS_CORREO_ACTIVOS="$("${COMPOSE[@]}" --profile servicios ps --orphans \
    --status running --status restarting --status paused --format '{{.Service}}')"
  if grep -qx 'notificaciones' <<< "$SERVICIOS_CORREO_ACTIVOS"; then
    rojo "Hay un consumidor notificaciones activo de la versión anterior."
    rojo "Detén ese servicio con su Compose anterior antes de arrancar trabajador; conserva las colas."
    exit 1
  fi
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
    gris "  Levantando los servicios de dominio y el API Gateway"
    "${COMPOSE[@]}" --profile servicios up -d $CONSTRUIR \
      --scale boleteria="$REPLICAS" \
      nucleo boleteria trabajador \
      api-gateway portal-web-cliente portal-web-admin
    ;;
  todo)
    gris "  Levantando la capa de datos, los microservicios y el API Gateway"
    "${COMPOSE[@]}" --profile servicios up -d $CONSTRUIR \
      --scale boleteria="$REPLICAS"
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

# Resuelve el contenedor de un servicio de Compose. El Núcleo y
# Boletería no tienen `container_name` —es lo que permite replicarlos
# (ADR-12)—, así que su nombre lo pone Docker y hay que preguntárselo.
contenedor_de() {
  "${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -1
}

if [[ "$ROL" != "datos" ]]; then
  titulo "Esperando a que los servicios respondan"
  for servicio in nucleo boleteria trabajador \
                  api-gateway portal-web-cliente portal-web-admin; do
    id="$(contenedor_de "$servicio")"
    if [[ -n "$id" ]] && esperar_sano "$id"; then
      verde "  $servicio listo"
    else
      rojo "  $servicio no llegó a estar sano. Mira: ${COMPOSE[*]} logs $servicio"
      exit 1
    fi
  done
fi

# --- Esquema y datos de ejemplo ---------------------------------------------

# La tarea Compose preparacion-base migra una sola vez, antes de ambas aplicaciones.

# Carga en Redis el inventario de cada establecimiento de Pedidos.
#
# El CU-011 reserva inventario con scripts Lua sobre Redis, y esos contadores
# no salen de PostgreSQL: hay que sembrarlos con un comando de mantenimiento,
# uno por establecimiento. Sin ellos el checkout responde 503
# INVENTARIO_NO_PREPARADO aunque la base esté perfecta.
#
# El comando se niega a pisar un inventario ya cargado (INVENTARIO_YA_EXISTENTE),
# que es lo correcto en producción; aquí eso no es un error, solo significa que
# ya estaba hecho.
preparar_inventario_pedidos() {
  # El inventario pertenece a Alimentos, dentro del workspace del Núcleo.
  local carpeta="$RAIZ/App/backend"
  [[ -d "$carpeta/node_modules" ]] || return 0

  local establecimientos
  establecimientos="$(docker exec hexacore-postgres psql -qtA \
    --username=hexacore --dbname="${POSTGRES_BD:-hexacore}" \
    -c 'SELECT id FROM alimentos.establecimientos;' 2>/dev/null || true)"
  if [[ -z "$establecimientos" ]]; then
    gris "  pedidos: sin establecimientos, no hay inventario que preparar"
    return 0
  fi

  local preparados=0 ya=0
  while read -r establecimiento; do
    [[ -n "$establecimiento" ]] || continue
    local salida
    salida="$(cd "$carpeta" && REDIS_HOST="${HOST_REDIS:-localhost}" \
      REDIS_PUERTO="${PUERTO_REDIS:-6380}" \
      npm run inventario:preparar -- \
      "$establecimiento" --compras-detenidas 2>&1 || true)"
    if grep -q 'Inventario preparado' <<<"$salida"; then
      preparados=$(( preparados + 1 ))
    elif grep -q 'INVENTARIO_YA_EXISTENTE' <<<"$salida"; then
      ya=$(( ya + 1 ))
    else
      gris "  pedidos: no se pudo preparar $establecimiento"
    fi
  done <<<"$establecimientos"

  verde "  pedidos: inventario en Redis ($preparados preparados, $ya ya estaban)"
}

sembrar() {
  local servicio="$1" tarea="${2:-semilla}" carpeta="$RAIZ/App/backend"
  [[ "$servicio" == "nucleo" || "$servicio" == "boleteria" ]] || { rojo "Programa retirado: $servicio"; return 1; }
  if [[ ! -d "$carpeta/node_modules" ]]; then
    rojo "  $servicio: falta npm ci en $carpeta"
    return 1
  fi
  if (cd "$carpeta" && npm run "$tarea" >/dev/null 2>&1); then
    verde "  $servicio: datos de ejemplo listos"
  else
    rojo "  $servicio: falló $tarea"
    return 1
  fi
}

if [[ "$DEMO" == "si" && "$ROL" != "datos" ]]; then
  [[ -z "$DATOS" ]] || { rojo "Las semillas automáticas solo admiten instalación local vacía."; exit 1; }
  command -v npm >/dev/null && [[ -d "$RAIZ/App/backend/node_modules" ]] || {
    rojo "Instala Node 22.22.3 y npm ci en App/backend antes de solicitar semillas."; exit 1;
  }
  # Cuenta todas las tablas de negocio, salvo los cuatro roles iniciales y los
  # historiales. No se confía en estadísticas aproximadas ni se trunca para vaciar.
  OCUPADAS="$(docker exec -i hexacore-postgres psql -U hexacore -d "${POSTGRES_BD:-hexacore}" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT format('SELECT count(*) FROM %I.%I;',schemaname,tablename)
FROM pg_tables WHERE schemaname IN ('identidad','alimentos','personal_logistica',
 'entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr','finanzas_pagos',
 'eventos_recintos')
AND tablename NOT IN ('migraciones','migrations')
AND NOT (schemaname='identidad' AND tablename='roles')
\gexec
SELECT count(*) FROM migracion_control.procedencia WHERE origen <> 'instalacion-vacia';
SQL
)"
  if grep -qv '^0$' <<<"$OCUPADAS"; then
    rojo "Semillas rechazadas: la base contiene datos o procede de una transferencia."; exit 1
  fi
  titulo "Datos de ejemplo explícitos sobre instalación vacía"
  sembrar nucleo semilla:identidad
  sembrar boleteria semilla:ventas
  sembrar boleteria semilla:catalogo
  sembrar nucleo semilla:logistica
  sembrar nucleo semilla:alimentos
  sembrar nucleo semilla:eventos
  preparar_inventario_pedidos
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

  No se crean cuentas salvo --datos-demo npm sobre instalación local vacía.

  Portales web (ya levantados):

    http://$IP_LOCAL:4200      clientes
    http://$IP_LOCAL:4201      administración (roles Administrador y Organizador)

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
