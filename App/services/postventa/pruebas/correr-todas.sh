#!/usr/bin/env bash
# Corre las suites de integración de Postventa (CU-006) contra la
# infraestructura real. A diferencia de `npm test`, estas necesitan Docker y
# los servicios en marcha: comprueban lo que un doble de prueba no puede —que
# el bloqueo distribuido, la cola y las restricciones de la base se comporten
# de verdad— y, desde ADR-14, también **que las dos Sagas funcionen contra el
# Ventas real**, que es lo que las pruebas unitarias solo pueden simular.
#
# Cada suite resiembra al empezar, así que el orden no importa y una que falle
# no arrastra a la siguiente.
#
#   cd ../../infra && ./iniciar.sh
#   npm run migracion:correr && npm run start:dev
#   npm run test:integracion
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf http://localhost:3011/api/v1/salud > /dev/null; then
  echo "Postventa no responde en localhost:3011. Levántalo con 'npm run start:dev'." >&2
  exit 1
fi

# Ventas es el dueño de `entradas`: sin él no hay nada que revender, y las dos
# Sagas del CU-006 —publicar y transferir— le hablan directamente. Que esta
# comprobación exista es la dependencia de ADR-14 hecha explícita.
if ! curl -sf http://localhost:3001/api/v1/salud > /dev/null; then
  echo "Ventas no responde en localhost:3001. Es el dueño de las entradas: sin él no hay reventa." >&2
  echo "Levántalo con 'cd ../ventas && npm run start:dev'." >&2
  exit 1
fi

# rnf06-autenticacion inicia sesión de verdad: necesita también Autenticación.
if ! curl -sf http://localhost:3002/api/v1/salud > /dev/null; then
  echo "Autenticación no responde en localhost:3002 (lo necesita rnf06-autenticacion)." >&2
  echo "Levántalo con 'cd ../autenticacion && npm run start:dev'." >&2
  exit 1
fi

fallos=0
for suite in cu006-flujo-completo cu006b-publicaciones cu006-eventos-cola \
             cu006d-expiracion rnf01-concurrencia rnf06-autenticacion; do
  printf '  %-26s ' "$suite"
  if salida=$(python3 "pruebas/$suite.py" 2>&1); then
    echo "OK"
  else
    echo "FALLO"
    echo "$salida" | tail -15 | sed 's/^/      /'
    fallos=$((fallos + 1))
  fi
done

if [ "$fallos" -gt 0 ]; then
  echo "
$fallos suite(s) con fallos." >&2
  exit 1
fi
echo "
Todas las suites de integración pasan."
