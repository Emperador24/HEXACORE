#!/usr/bin/env bash
#
# Datos de demostración de HEXACORE, dentro del contenedor `datos-demo`.
#
# Lo arranca el perfil `demo` de App/infra/docker-compose.yml cuando ya están
# sanos la base preparada, Núcleo, Boletería y el gateway (la semilla de
# logística da de alta al personal por la API).
#
# Solo siembra sobre una instalación vacía. Si la base ya tiene datos, no toca
# nada y termina bien: así se puede volver a levantar el perfil `demo` sin
# miedo a duplicar ni pisar nada.

set -euo pipefail

export PGPASSWORD="$POSTGRES_CONTRASENA"
PSQL=(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PUERTO" -U "$POSTGRES_USUARIO" -d "$POSTGRES_BD" -qAt -v ON_ERROR_STOP=1)

# Cuenta todas las tablas de negocio, salvo los roles iniciales y los
# historiales. Mismo criterio que tenía iniciar.sh cuando sembraba desde el
# anfitrión.
OCUPADAS="$("${PSQL[@]}" <<'SQL'
SELECT format('SELECT count(*) FROM %I.%I;',schemaname,tablename)
FROM pg_tables WHERE schemaname IN ('identidad','alimentos','personal_logistica',
 'entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr','finanzas_pagos',
 'eventos_recintos')
AND tablename NOT IN ('migraciones','migrations')
AND NOT (schemaname='identidad' AND tablename='roles')
\gexec
SELECT count(*) FROM migracion_control.procedencia WHERE origen <> 'instalacion-vacia';
SQL
)"
if grep -qv '^0$' <<<"$OCUPADAS"; then
  echo "La base ya tiene datos o procede de una transferencia: no se siembra nada."
  exit 0
fi

for tarea in semilla:identidad semilla:ventas semilla:catalogo semilla:logistica semilla:alimentos semilla:eventos; do
  echo "→ $tarea"
  npm run --silent "$tarea"
done

# El CU-011 reserva inventario en Redis con scripts Lua; esos contadores no
# salen de PostgreSQL y hay que cargarlos uno por establecimiento.
echo "→ inventario de Pedidos en Redis"
while read -r establecimiento; do
  [[ -n "$establecimiento" ]] || continue
  npm run --silent inventario:preparar -- "$establecimiento" --compras-detenidas
done < <("${PSQL[@]}" -c 'SELECT id FROM alimentos.establecimientos;')

echo "Datos de demostración listos."
