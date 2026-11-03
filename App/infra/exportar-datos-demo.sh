#!/usr/bin/env bash
# Exportación explícita de la base consolidada. No restaura ni modifica datos.
# Los respaldos pueden contener credenciales/tokens: nunca se versionan.
set -euo pipefail
if [[ $# -ne 1 || "$1" != /*.dump ]]; then
  echo "Uso: ./exportar-datos-demo.sh /ruta/privada/nueva.dump" >&2
  exit 1
fi
if [[ -e "$1" ]]; then echo "El destino ya existe" >&2; exit 1; fi
umask 077
docker exec hexacore-postgres pg_dump -U hexacore -d "${POSTGRES_BD:-hexacore}" --format=custom > "$1"
echo "Respaldo creado. Restaurar requiere corte y conciliación explícitos; iniciar.sh no lo carga."
