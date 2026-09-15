#!/usr/bin/env bash
# Corre las cuatro suites de integración del CU-006 contra la infraestructura
# real. A diferencia de `npm test`, estas necesitan Docker y el servicio en
# marcha: comprueban lo que un doble de prueba no puede: que el bloqueo
# distribuido, la cola y las restricciones de la base se comporten de verdad.
#
#   docker compose -f ../../infra/docker-compose.yml up -d
#   npm run migracion:correr && npm run semilla && npm run start:dev
#   npm run test:integracion
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf http://localhost:3001/api/v1/salud > /dev/null; then
  echo "El servicio no responde en localhost:3001. Levántalo con 'npm run start:dev'." >&2
  exit 1
fi

fallos=0
for suite in cu006-flujo-completo rnf01-concurrencia cu006-eventos-cola cu006d-expiracion; do
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
Las cuatro suites de integración pasaron."
