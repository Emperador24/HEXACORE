#!/usr/bin/env bash
#
# Cobertura de las pruebas de INTEGRACIÓN sobre este servicio.
#
#   ./pruebas/cobertura-integracion.sh
#
# ## Qué mide, y por qué no basta con `npm run test:cov`
#
# `test:cov` mide las pruebas **unitarias**: lo que cubre un puñado de clases
# aisladas con sus dependencias simuladas. Y además engaña, porque Jest solo
# cuenta los archivos que esas pruebas tocan — de ahí que reporte más del 90 %
# midiendo tres archivos de cincuenta.
#
# Esto es lo otro: se levanta el servicio **de verdad** —con PostgreSQL, Redis y
# RabbitMQ— instrumentado con `c8`, se le lanzan encima las suites de
# `pruebas/*.py`, que hablan por HTTP como lo haría la app, y al terminar se
# mide qué porcentaje del código quedó realmente ejecutado.
#
# Es el número que pide la rúbrica de la entrega ("cobertura de pruebas de
# integración sobre el backend"), y el único que se puede defender: cuenta todo
# el servicio, no solo lo que las pruebas eligieron mirar.
#
# ## Requisitos
#
# La infraestructura tiene que estar arriba (`App/infra/iniciar.sh`). Si el
# servicio está corriendo en contenedor, este script lo para mientras dura la
# medición —necesita el puerto— y lo vuelve a levantar al terminar.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PUERTO="${PUERTO:-3002}"
CONTENEDOR="hexacore-administracion"
COBERTURA="cobertura-integracion"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }

contenedor_estaba_arriba="no"
pid_servicio=""

limpiar() {
  if [[ -n "$pid_servicio" ]] && kill -0 "$pid_servicio" 2>/dev/null; then
    # SIGTERM y no SIGKILL: c8 escribe la cobertura cuando el proceso termina
    # ordenadamente. Con -9 no se escribe nada y la medición se pierde.
    kill -TERM "$pid_servicio" 2>/dev/null || true
    wait "$pid_servicio" 2>/dev/null || true
  fi
  if [[ "$contenedor_estaba_arriba" == "si" ]]; then
    gris "  Volviendo a levantar $CONTENEDOR"
    docker start "$CONTENEDOR" >/dev/null 2>&1 || true
  fi
}
trap limpiar EXIT

# --- El puerto tiene que estar libre ----------------------------------------

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTENEDOR}$"; then
  gris "Parando $CONTENEDOR para liberar el puerto $PUERTO"
  docker stop "$CONTENEDOR" >/dev/null
  contenedor_estaba_arriba="si"
fi

# --- Compilar e instrumentar -------------------------------------------------

gris "Compilando"
npm run build >/dev/null

gris "Levantando el servicio instrumentado con c8"
rm -rf "$COBERTURA" .nyc_output
npx c8 \
  --reporter=text-summary --reporter=html --reporter=json-summary \
  --report-dir="$COBERTURA" \
  --src=src \
  --all \
  --exclude='dist/**/*.spec.js' \
  --exclude='src/**/*.spec.ts' \
  --exclude='**/migraciones/**' \
  --exclude='**/semillas/**' \
  node dist/main.js > "$COBERTURA.log" 2>&1 &
pid_servicio=$!

# --- Esperar a que responda --------------------------------------------------

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PUERTO/api/v1/salud" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$pid_servicio" 2>/dev/null; then
    rojo "El servicio murió al arrancar. Log:"
    tail -20 "$COBERTURA.log"
    exit 1
  fi
  sleep 1
done
verde "  Servicio arriba en el puerto $PUERTO"

# --- Las suites de integración ----------------------------------------------

echo
gris "Corriendo las suites de integración"
fallidas=0
for suite in pruebas/cu027-*.py pruebas/cu027b-*.py; do
  [[ -e "$suite" ]] || continue
  nombre="$(basename "$suite")"
  # La de disponibilidad tumba dependencias a propósito y reinicia el
  # contenedor: no tiene sentido con el servicio corriendo fuera de Docker.
  if [[ "$nombre" == "cu027-disponibilidad.py" ]]; then
    gris "  $nombre (se omite: mide caídas del contenedor)"
    continue
  fi
  if python3 "$suite" >/dev/null 2>&1; then
    verde "  $nombre"
  else
    rojo "  $nombre — falló"
    fallidas=$(( fallidas + 1 ))
  fi
done

# --- Cerrar y reportar -------------------------------------------------------

echo
gris "Parando el servicio para que c8 escriba la cobertura"
kill -TERM "$pid_servicio"
wait "$pid_servicio" 2>/dev/null || true
pid_servicio=""

echo
sed -n '/Coverage summary/,/=====/p' "$COBERTURA.log" || true
grep -A 6 "Coverage summary" "$COBERTURA.log" || cat "$COBERTURA.log" | tail -12

echo
verde "Informe navegable: $COBERTURA/index.html"
[[ "$fallidas" -gt 0 ]] && rojo "$fallidas suites fallaron: la cobertura de arriba está incompleta"
exit 0
