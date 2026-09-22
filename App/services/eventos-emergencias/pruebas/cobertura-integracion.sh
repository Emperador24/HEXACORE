#!/usr/bin/env bash
#
# Cobertura de las pruebas de INTEGRACIÓN sobre este servicio.
#
#   ./pruebas/cobertura-integracion.sh
#
# Mismo punto de entrada que en Administración y Entradas, para que la
# demostración de la entrega se haga igual en los cuatro servicios.
#
# ## En qué se diferencia de los otros dos
#
# Allí las pruebas de integración son scripts de Python que hablan por HTTP con
# el servicio ya levantado, así que hay que instrumentarlo con `c8` por fuera.
# Aquí las pruebas viven en `test/*.e2e-spec.ts`: levantan la aplicación Nest
# entera dentro del propio proceso de Vitest y hablan con PostgreSQL y RabbitMQ
# de verdad. Al correr en el mismo proceso, `--coverage` de Vitest ya mide lo
# que se ejecuta; no hace falta c8.
#
# Lo que ambas cosas tienen en común, y es lo que pide la rúbrica: el número
# sale de ejercitar el servicio real contra sus dependencias reales, no de
# pruebas unitarias con dobles.
#
# ## Requisitos
#
# PostgreSQL y RabbitMQ arriba (`App/infra/iniciar.sh`).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

printf '\033[90m%s\033[0m\n' "Corriendo las pruebas de integración con cobertura"
npm run test:e2e:cov

echo
printf '\033[32m%s\033[0m\n' "Informe navegable: cobertura-integracion/index.html"
