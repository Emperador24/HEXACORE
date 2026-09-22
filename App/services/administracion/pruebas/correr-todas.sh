#!/usr/bin/env bash
#
# Corre las suites de integración del Servicio de Administración (CU-027)
# contra la infraestructura real. A diferencia de `npm test`, estas necesitan
# Docker y el servicio en marcha: comprueban lo que un doble de prueba no
# puede: que las sesiones se revoquen de verdad en Redis, que los correos
# salgan por la cola y que la base responda a lo que se le pide.
#
#   cd App/infra && ./iniciar.sh
#   cd App/services/administracion && npm run test:integracion
#
# `cu027-disponibilidad` pausa dependencias a propósito para medir RNF-03/04,
# así que va la última: si algo se quedara a medias, no arrastra a las demás.
set -uo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf http://localhost:3002/api/v1/salud > /dev/null; then
  echo "El servicio no responde en localhost:3002. Levántalo con 'cd ../../infra && ./iniciar.sh'." >&2
  exit 1
fi

fallos=0
for suite in cu027-registro cu027-verificacion cu027-login cu027-renovacion \
             cu027-recuperacion-perfil cu027b-administracion cu027-disponibilidad; do
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
