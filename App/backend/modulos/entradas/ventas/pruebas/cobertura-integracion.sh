#!/usr/bin/env bash
# Cobertura de la integración aislada; no controla contenedores habituales.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
npm run test:cov:boleteria
