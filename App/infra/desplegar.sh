#!/usr/bin/env bash
#
# Despliega HEXACORE en el servidor de producción.
#
#   ./desplegar.sh sha-<SHA40>       la versión exacta que publicó el CD (lo que usa el CD)
#   ./desplegar.sh main              la última de main
#   ./desplegar.sh --compilar        compila aquí desde el código (si el CD no puede publicar)
#   ./desplegar.sh --datos-demo      además, datos de ejemplo (solo sobre una base vacía)
#   ./desplegar.sh --estado          qué versión está desplegada y cómo están los contenedores
#
# Usa docker-compose.yml + docker-compose.registro.yml + docker-compose.produccion.yml
# y la configuración de App/infra/.env (ver DESPLIEGUE.md).
#
# Si la versión nueva no llega a estar sana, vuelve sola a la que estaba: una
# página caída por un despliegue malo dura lo que tarda en fallar la sonda, no
# hasta que alguien se entere. Volver de versión no revierte la base de datos:
# las migraciones son hacia delante (ver CORTE-Y-REVERSION.md).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

ETIQUETA=""
COMPILAR="no"
DEMO="no"
ESTADO="no"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --compilar)   COMPILAR="si"; shift ;;
    --datos-demo) DEMO="si"; shift ;;
    --estado)     ESTADO="si"; shift ;;
    -h|--help)    sed -n '3,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)           rojo "Opción desconocida: $1"; exit 1 ;;
    *)            ETIQUETA="$1"; shift ;;
  esac
done

[[ -f .env ]] || { rojo "Falta App/infra/.env. Ejecuta primero preparar-servidor.sh (ver DESPLIEGUE.md)."; exit 1; }
grep -q '^DOMINIO=.\+' .env || { rojo "Falta DOMINIO=... en App/infra/.env"; exit 1; }
[[ -f claves-produccion/jwt-privada.pem && -f claves-produccion/jwt-publica.pem ]] || {
  rojo "Faltan las claves JWT de producción en App/infra/claves-produccion/. Ejecuta preparar-servidor.sh."; exit 1; }

ARCHIVO_VERSION=".version-desplegada"
BASE=(docker compose -f docker-compose.yml)
PROD=(-f docker-compose.produccion.yml --profile servicios)

if [[ "$ESTADO" == "si" ]]; then
  echo "Versión desplegada: $(cat "$ARCHIVO_VERSION" 2>/dev/null || echo '(ninguna registrada)')"
  "${BASE[@]}" -f docker-compose.registro.yml "${PROD[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
  exit 0
fi

# Lee una variable de .env sin ejecutarlo: un `source` fallaría con valores
# con espacios, como la contraseña de aplicación de Gmail.
variable() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
DOMINIO="$(variable DOMINIO)"
DOMINIO_ADMIN="$(variable DOMINIO_ADMIN)"

# Imágenes privadas en ghcr.io: con GHCR_USUARIO y GHCR_TOKEN en .env se
# inicia sesión. Si el paquete es público no hace falta.
if [[ -n "$(variable GHCR_TOKEN)" ]]; then
  variable GHCR_TOKEN | docker login ghcr.io -u "$(variable GHCR_USUARIO)" --password-stdin >/dev/null
fi

levantar() {  # $1 = etiqueta o "compilar"
  if [[ "$1" == "compilar" ]]; then
    # De a una imagen: compilar Angular y Nest a la vez agota una VM de 4 GB.
    COMPOSE_PARALLEL_LIMIT=1 COMPOSE_BAKE=false "${BASE[@]}" "${PROD[@]}" \
      up -d --build --wait --wait-timeout 900 --remove-orphans < /dev/null
  else
    export HEXACORE_ETIQUETA="$1"
    "${BASE[@]}" -f docker-compose.registro.yml "${PROD[@]}" pull --quiet
    # Con límite: sin él, un contenedor que nunca queda sano dejaría colgado el CD.
    "${BASE[@]}" -f docker-compose.registro.yml "${PROD[@]}" up -d --wait --wait-timeout 300 --remove-orphans
  fi
}

NUEVA="${ETIQUETA:-main}"
[[ "$COMPILAR" == "si" ]] && NUEVA="compilar"
ANTERIOR="$(cat "$ARCHIVO_VERSION" 2>/dev/null || true)"

echo "Desplegando $NUEVA en ${DOMINIO}${ANTERIOR:+ (antes: $ANTERIOR)}"
if levantar "$NUEVA"; then
  echo "$NUEVA" > "$ARCHIVO_VERSION"
  verde "Desplegado $NUEVA"
else
  rojo "La versión $NUEVA no llegó a estar sana."
  if [[ -n "$ANTERIOR" && "$ANTERIOR" != "$NUEVA" ]]; then
    gris "Volviendo a $ANTERIOR…"
    if levantar "$ANTERIOR"; then
      rojo "Se volvió a $ANTERIOR. Revisa los registros de $NUEVA antes de reintentar."
    else
      rojo "Tampoco arrancó $ANTERIOR. Mira: docker compose ... logs"
    fi
  fi
  exit 1
fi

if [[ "$DEMO" == "si" ]]; then
  # La imagen de herramientas se compila aquí (el CD no la publica).
  "${BASE[@]}" "${PROD[@]}" --profile demo run --rm --no-deps --build datos-demo
fi

# Imágenes viejas que ya no usa nadie: el disco de una VM pequeña se llena
# rápido con una imagen por commit.
docker image prune -f --filter "until=168h" >/dev/null || true

verde "https://${DOMINIO}   https://${DOMINIO_ADMIN:-admin.${DOMINIO}}"
