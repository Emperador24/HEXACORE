#!/usr/bin/env bash
set -euo pipefail
exec python3 "$(dirname "$0")/revision/revision.py" --perfil cu015 "$@"
