#!/usr/bin/env bash
#
# Corre las suites de integración de Alimentos (CU-011 a CU-015) contra la infraestructura real.
# Cubre sus dos módulos: Administración (CU-027) y Pedidos (CU-011). A
# diferencia de `npm test`, estas necesitan Docker y el servicio en marcha:
# comprueban lo que un doble de prueba no puede —que las sesiones se revoquen
# de verdad en Redis, que los correos salgan por la cola, que los guiones Lua
# reserven inventario de verdad y que la idempotencia del pago la sostenga la
# clave primaria de PostgreSQL.
#
#   cd App/infra && ./iniciar.sh
#   cd App/services/nucleo && npm run test:integracion
#
# `cu027-disponibilidad` pausa dependencias a propósito para medir RNF-03/04,
# así que va la última: si algo se quedara a medias, no arrastra a las demás.
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf http://localhost:3007/api/v1/salud > /dev/null; then
  echo "El servicio no responde en localhost:3007. Levántalo con 'cd ../../infra && ./iniciar.sh'." >&2
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
