#!/usr/bin/env bash
#
# Crea y migra la base que usan las pruebas de integración.
#
# ## Por qué existe
#
# Las e2e escriben empleados, turnos, fichajes y notificaciones de verdad, y
# hasta ahora lo hacían sobre `eventos_emergencias`, la MISMA base con la que
# se trabaja a diario. Cada corrida dejaba su rastro y nadie lo recogía: se
# llegaron a acumular 719 empleados y 415 turnos frente a los 5 y 1 de la
# semilla, la pantalla del jefe en la app mostraba cientos de "Empleado
# cred-a3f9…", y los volcados de datos de ejemplo —que se versionan— llegaron
# a pesar 392 KB de pura basura.
#
# Recoger esa basura después es tratar el síntoma. Esto quita la causa: las
# pruebas van a su propia base y la de desarrollo no se toca.
#
# Lo llama `pretest:e2e`, así que no hay que acordarse de ejecutarlo.

set -euo pipefail

BASE="${DB_NAME:-eventos_emergencias_pruebas}"
CONTENEDOR="${POSTGRES_CONTENEDOR:-hexacore-postgres}"

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTENEDOR}$"; then
  echo "PostgreSQL no está corriendo. Levanta la infraestructura: App/infra/iniciar.sh" >&2
  exit 1
fi

# `CREATE DATABASE IF NOT EXISTS` no existe en PostgreSQL: hay que preguntar.
existe="$(docker exec "$CONTENEDOR" psql -qtA --username=hexacore --dbname=postgres \
  -c "SELECT 1 FROM pg_database WHERE datname = '$BASE';")"

if [[ -z "$existe" ]]; then
  docker exec "$CONTENEDOR" createdb --username=hexacore --owner=hexacore "$BASE"
  echo "Base de pruebas creada: $BASE"
fi

DB_NAME="$BASE" npm run migracion:correr >/dev/null

# Y se vacía antes de cada corrida. Dos motivos: que no crezca sin fin —en tres
# ejecuciones ya iba por 420 empleados—, y que las pruebas no dependan de lo
# que dejó la anterior. `migraciones` se conserva, que es el registro del
# esquema, no datos.
docker exec "$CONTENEDOR" psql -qtA --username=hexacore --dbname="$BASE" -c "
  DO \$\$
  DECLARE tablas text;
  BEGIN
    SELECT string_agg(format('%I', tablename), ', ')
      INTO tablas
      FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'migraciones';
    IF tablas IS NOT NULL THEN
      EXECUTE 'TRUNCATE TABLE ' || tablas || ' RESTART IDENTITY CASCADE';
    END IF;
  END
  \$\$;" >/dev/null
