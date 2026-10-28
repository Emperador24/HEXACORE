#!/usr/bin/env bash
# Corre las suites de integración del servicio contra la infraestructura real:
# la venta primaria (CU-001 a CU-005) y el mercado secundario (CU-006). A
# diferencia de `npm test`, estas necesitan Docker y el servicio en marcha:
# comprueban lo que un doble de prueba no puede: que el bloqueo distribuido, la
# cola y las restricciones de la base se comporten de verdad.
#
# Cada suite resiembra al empezar, así que el orden no importa y una que falle
# no arrastra a la siguiente.
#
#   docker compose -f ../../infra/docker-compose.yml up -d
#   npm run migracion:correr && npm run semilla && npm run start:dev
#   npm run test:integracion
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf http://localhost:3009/api/v1/salud > /dev/null; then
  echo "El servicio no responde en localhost:3009. Levántalo con 'npm run start:dev'." >&2
  exit 1
fi
# rnf06-autenticacion inicia sesión de verdad: necesita también Administración.
if ! curl -sf http://localhost:3002/api/v1/salud > /dev/null; then
  echo "El Servicio de Administración no responde en localhost:3002 (lo necesita rnf06-autenticacion)." >&2
  echo "Levántalo con 'cd ../administracion && npm run start:dev'." >&2
  exit 1
fi

fallos=0
for suite in asr01-cola; do
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
