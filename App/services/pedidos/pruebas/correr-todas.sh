#!/usr/bin/env bash
#
# Corre las suites de integración del Servicio de Pedidos (CU-011) contra la
# infraestructura real. A diferencia de `npm test`, estas necesitan Docker y el
# servicio en marcha: comprueban lo que un doble de prueba no puede: que los
# guiones Lua reserven inventario de verdad en Redis, que la idempotencia del
# pago la sostenga la clave primaria de PostgreSQL y que el barrido de reservas
# suelte lo que nadie pagó.
#
#   cd App/infra && ./iniciar.sh
#   cd App/services/pedidos && npm run test:integracion
#
# Cada suite resiembra y recarga el inventario al empezar, así que el orden no
# importa y una que falle no arrastra a la siguiente.
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf http://localhost:3003/api/v1/salud > /dev/null; then
  echo "El servicio no responde en localhost:3003. Levántalo con 'cd ../../infra && ./iniciar.sh'." >&2
  exit 1
fi

fallos=0
for suite in cu011-flujo-completo cu011-autenticacion cu011b-pagos; do
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
Todas las suites de integración pasaron."
