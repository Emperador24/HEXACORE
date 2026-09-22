#!/usr/bin/env bash
#
# Devuelve las bases de desarrollo al estado de la semilla.
#
#   ./limpiar-datos-de-pruebas.sh          muestra qué sobra y pregunta
#   ./limpiar-datos-de-pruebas.sh --si     sin preguntar
#
# ## Por qué hace falta
#
# Las suites de `pruebas/*.py` hablan por HTTP con el sistema **de verdad**: es
# lo que las hace valer como pruebas de integración, y también lo que deja
# rastro. Cada corrida crea cuentas, publicaciones, pedidos o fichajes que
# nadie recoge.
#
# Las pruebas e2e de Vitest ya no ensucian: desde que tienen su propia base
# (`*_pruebas`) no tocan estas. Lo que queda es esto.
#
# ## Qué hace
#
# Tres de las cuatro semillas borran antes de insertar, así que basta con
# volver a correrlas. La de logística (`seed.mjs`) solo inserta —por eso su
# base llegó a 719 empleados frente a los 5 de la semilla—, así que ahí se
# quita primero lo que no es de la semilla.
#
# Al final se recarga el inventario de Redis del CU-011, que se reconstruye
# desde la base recién sembrada.
#
# NO borra volúmenes ni esquemas: para empezar de cero está `down -v` y luego
# `./iniciar.sh`.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
RAIZ="$(cd ../.. && pwd)"

CONTENEDOR="hexacore-postgres"
SIN_PREGUNTAR="no"
[[ "${1:-}" == "--si" ]] && SIN_PREGUNTAR="si"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$*"; }

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTENEDOR}$"; then
  rojo "PostgreSQL no está corriendo. Levanta el sistema: ./iniciar.sh"
  exit 1
fi

consulta() {
  docker exec "$CONTENEDOR" psql -qtA --username=hexacore --dbname="$1" -c "$2" 2>/dev/null || echo 0
}

# --- Qué sobra ---------------------------------------------------------------

titulo "Datos que no son de la semilla"

sobrantes_logistica=$(consulta eventos_emergencias \
  "SELECT count(*) FROM empleados WHERE credencial NOT LIKE '%@hexacore.com';")
notificaciones=$(consulta eventos_emergencias "SELECT count(*) FROM notificaciones;")
zonas=$(consulta eventos_emergencias "SELECT count(*) FROM zonas_evento WHERE \"eventoId\" LIKE 'evento-%';")
cuentas_carga=$(consulta administracion "SELECT count(*) FROM usuarios WHERE email LIKE 'carga-%';")

printf '  %-42s %s\n' "empleados ajenos a la semilla"      "$sobrantes_logistica"
printf '  %-42s %s\n' "zonas de eventos inventados"        "$zonas"
printf '  %-42s %s\n' "notificaciones de la cola"          "$notificaciones"
printf '  %-42s %s\n' "cuentas de prueba de carga"         "$cuentas_carga"
gris  "  (las publicaciones, pedidos y transacciones las rehace cada semilla)"

if [[ "$SIN_PREGUNTAR" != "si" ]]; then
  echo
  read -r -p "Se vuelven a sembrar las cuatro bases. ¿Seguir? [s/N] " respuesta
  [[ "$respuesta" =~ ^[sS]$ ]] || { gris "Sin cambios."; exit 0; }
fi

# --- Logística: su semilla no borra, hay que hacerlo aquí --------------------

titulo "Limpiando"

docker exec -i "$CONTENEDOR" psql -q --username=hexacore --dbname=eventos_emergencias <<'SQL'
BEGIN;
CREATE TEMP TABLE basura AS
  SELECT id FROM empleados WHERE credencial NOT LIKE '%@hexacore.com';
CREATE TEMP TABLE turnos_basura AS
  SELECT id FROM turnos WHERE "empleadoId" IN (SELECT id FROM basura);
DELETE FROM solicitudes_cambio_turno WHERE "turnoId" IN (SELECT id FROM turnos_basura);
DELETE FROM registros_asistencia
 WHERE "empleadoId" IN (SELECT id FROM basura) OR "turnoId" IN (SELECT id FROM turnos_basura);
DELETE FROM turnos WHERE id IN (SELECT id FROM turnos_basura);
DELETE FROM empleados WHERE id IN (SELECT id FROM basura);
DELETE FROM zonas_evento WHERE "eventoId" LIKE 'evento-%';
-- Rastro de mensajes ya procesados, no datos de demostración.
DELETE FROM notificaciones;
COMMIT;
SQL
verde "  eventos_emergencias: sobrantes eliminados"

# --- Volver a sembrar --------------------------------------------------------

sembrar() {
  local servicio="$1" tarea="${2:-semilla}" carpeta="$RAIZ/App/services/$1"
  if [[ ! -d "$carpeta/node_modules" ]]; then
    gris "  $servicio: sin node_modules, se omite"
    return
  fi
  if (cd "$carpeta" && npm run "$tarea" >/dev/null 2>&1); then
    verde "  $servicio: sembrado de nuevo"
  else
    rojo "  $servicio: la semilla falló (correr a mano: npm run $tarea)"
  fi
}

sembrar administracion
sembrar entradas-mercado-secundario
sembrar eventos-emergencias seed
sembrar pedidos

# --- Inventario de Redis -----------------------------------------------------

carpeta_pedidos="$RAIZ/App/services/pedidos"
if [[ -d "$carpeta_pedidos/node_modules" ]]; then
  # Las reservas y el stock viejos ya no corresponden a la base recién
  # sembrada: se rehacen desde cero.
  docker exec hexacore-redis sh -c \
    "redis-cli --scan --pattern 'pedidos:inv:*' | xargs -r redis-cli del" >/dev/null 2>&1 || true
  preparados=0
  while read -r establecimiento; do
    [[ -n "$establecimiento" ]] || continue
    if (cd "$carpeta_pedidos" && REDIS_HOST=localhost REDIS_PUERTO="${PUERTO_REDIS:-6380}" \
        npx ts-node src/inventario/preparar-inventario.ts "$establecimiento" \
        --compras-detenidas 2>&1 | grep -q 'Inventario preparado'); then
      preparados=$(( preparados + 1 ))
    fi
  done < <(consulta pedidos "SELECT id FROM establecimientos;")
  verde "  pedidos: inventario de Redis rehecho ($preparados establecimientos)"
fi

titulo "Listo"
gris "  Las bases quedaron como las deja ./iniciar.sh"
