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
# ## Qué se deja fuera de la medición, y por qué
#
# Dos rutas se excluyen, y ninguna de las dos es código del servicio que las
# pruebas no alcancen:
#
#   src/herramientas/          `exportar-openapi.ts` es una utilidad de línea
#                              de órdenes (`npm run contrato:api`). No la carga
#                              `main.js`: nunca corre dentro del servicio, así
#                              que contarla sería medir otra cosa. Sus reglas
#                              sí se prueban, en `contrato-api.spec.ts`.
#
#   entrada-transferida.evento.ts  Es una interfaz de TypeScript y nada más. El
#                              JavaScript que genera está vacío —131 bytes de
#                              preámbulo—, así que sus 49 líneas no se pueden
#                              ejecutar ni con la mejor prueba del mundo. c8
#                              las contaba como descubiertas por `--all`.
#
# Todo lo demás entra, incluidos los módulos, los DTO y las entidades.
#
# ## Por qué el número no llega a 100 y no hay que forzarlo
#
# Los archivos `dto/*.ts` salen entre el 50 % y el 85 % aunque sus funciones de
# mapeo (`aCompraDto`, `aCheckoutDto`…) se ejecuten en cada petición. No es
# código sin probar: el plugin de Swagger de Nest genera en cada clase un
# `_OPENAPI_METADATA_FACTORY()` cuyo cuerpo es una sola línea larguísima, y su
# mapa de fuentes apunta a **todo el bloque de propiedades** de la clase. Como
# esa función generada no se llama, c8 pinta de rojo el bloque entero. Se ve a
# simple vista en el informe: hay líneas en blanco y comentarios marcados como
# no cubiertos, y un comentario no se puede ejecutar.
#
# Lo demás que queda sin cubrir son rutas de fallo de infraestructura —Redis
# caído, canal de RabbitMQ cerrado, la pasarela devolviendo algo que no encaja—
# y las validaciones de `configuracion.ts`, que solo se disparan al arrancar
# con una variable de entorno inválida. Llegar a ellas pide inyección de
# fallos, no otra petición HTTP.
#
# No se excluyen los DTO para maquillar el porcentaje: esconderlos escondería
# también sus funciones de mapeo, que sí son código de verdad y sí se prueban.
#
# ## Requisitos
#
# La infraestructura tiene que estar arriba (`App/infra/iniciar.sh`). Si el
# servicio está corriendo en contenedor, este script lo para mientras dura la
# medición —necesita el puerto— y lo vuelve a levantar al terminar.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PUERTO="${PUERTO:-3001}"
# Este servicio se replica para demostrar el balanceo, así que no tiene un
# `container_name` fijo: se busca por el nombre que compone Docker Compose.
CONTENEDOR="$(docker ps --format '{{.Names}}' 2>/dev/null | grep entradas-mercado-secundario | head -1)"
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

if [[ -n "$CONTENEDOR" ]]; then
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
  --exclude='src/herramientas/**' \
  --exclude='src/reventa/eventos/entrada-transferida.evento.ts' \
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
for suite in pruebas/cu001-*.py pruebas/cu002-*.py pruebas/cu003-*.py pruebas/cu005-*.py \
             pruebas/cu006-*.py pruebas/cu006b-*.py pruebas/cu006d-*.py \
             pruebas/rnf01-*.py pruebas/rnf06-*.py; do
  [[ -e "$suite" ]] || continue
  nombre="$(basename "$suite")"
  # `rnf07-desempeno.py` se omite: mide latencia, y con el servicio
  # instrumentado por c8 los números no serían los reales.
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
