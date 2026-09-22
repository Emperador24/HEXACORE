#!/usr/bin/env bash
#
# Exporta los datos de ejemplo a archivos SQL.
#
#   ./exportar-datos-demo.sh
#
# ## Para qué
#
# Las semillas (`npm run semilla`, `npm run seed`) corren con `ts-node` desde el
# código fuente: necesitan Node y las dependencias instaladas. En la máquina de
# la demostración —o en la de un compañero que solo tiene Docker y el proyecto—
# eso no está, y el sistema arrancaba **vacío**: sin cuentas, o sea sin poder
# entrar.
#
# Esto congela el resultado de las semillas en archivos SQL que `iniciar.sh`
# carga directamente en PostgreSQL. Con eso, levantar el sistema con datos
# usables no necesita más que Docker.
#
# El inventario de Redis de Pedidos **no** se exporta aquí: `iniciar.sh` lo
# deriva de PostgreSQL al arrancar, así que no hay un segundo archivo que se
# pueda quedar desfasado respecto a la semilla.
#
# ## Cuándo volver a correrlo
#
# Cuando cambien las semillas o el esquema. Los archivos se versionan a
# propósito: son parte de lo que hace falta para levantar el sistema, igual que
# el `docker-compose.yml`.
#
# Requiere el sistema arriba y ya sembrado (`./iniciar.sh`).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DESTINO="datos-demo"
CONTENEDOR="hexacore-postgres"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTENEDOR}$"; then
  rojo "PostgreSQL no está corriendo. Levanta el sistema primero: ./iniciar.sh"
  exit 1
fi

mkdir -p "$DESTINO"

for base in administracion entradas_mercado_secundario eventos_emergencias pedidos; do
  archivo="$DESTINO/$base.sql"
  gris "Exportando $base"

  # `--clean --if-exists` para que cargarlo sobre una base ya inicializada no
  # falle por objetos existentes; `--no-owner --no-privileges` para que no
  # dependa de qué usuario lo creó.
  docker exec "$CONTENEDOR" pg_dump \
    --username=hexacore \
    --dbname="$base" \
    --clean --if-exists \
    --no-owner --no-privileges \
    > "$archivo"

  filas=$(grep -c "^INSERT\|^COPY" "$archivo" || true)
  verde "  $archivo ($(du -h "$archivo" | cut -f1), $filas bloques de datos)"
done

echo
verde "Listo. Ahora una máquina con solo Docker puede levantar el sistema con datos:"
gris "  ./iniciar.sh --registro main --datos-demo sql"
