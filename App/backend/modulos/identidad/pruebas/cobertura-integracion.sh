#!/usr/bin/env bash
# Compatibilidad: cobertura de la integración aislada, sin parar servidores habituales.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
exec npm run test:cov:e2e
