#!/usr/bin/env bash
#
# Regenera el HTML y el PDF de las vistas de arquitectura y revisa sus flechas.
#
#   ./regenerar.sh                      todas las vistas de tipo architecture publicadas
#   ./regenerar.sh 02-contenedores …    solo esas
#
# Por qué no se llama a Archify directamente: cuando varias flechas llegan al
# mismo lado de una caja, Archify las separa como mucho 14 px y las puntas se
# enciman. Este guion usa una copia temporal de Archify (no toca la instalada)
# en la que esas flechas se reparten a lo largo de todo el lado. Las vistas
# están dimensionadas para eso: el lado de una caja mide lo mismo que el
# tramo entre las cajas con las que se conecta, así cada flecha baja recta.
#
# Después de generar, revisar-flechas.py comprueba que ninguna flecha comparta
# tramo con otra ni llegue al mismo punto de una caja que otra.
#
# Requiere Archify (ARCHIFY, por omisión ~/.claude/skills/archify), Node,
# Python 3, Google Chrome y pdfcrop.
set -euo pipefail

cd "$(dirname "$0")"
ORIGEN="${ARCHIFY:-$HOME/.claude/skills/archify}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

# La instalación suele ser un enlace simbólico: se copia lo que apunta.
mkdir "$TEMPORAL/archify"
cp -RL "$ORIGEN/." "$TEMPORAL/archify/"
RENDER="$TEMPORAL/archify/renderers/architecture/render-architecture.mjs"
perl -pi -e 's/automaticPortSpread\(arch\.connections, components\)/automaticPortSpread(arch.connections, components, { maxSpacing: Infinity })/' "$RENDER"
grep -q 'maxSpacing: Infinity' "$RENDER" || { echo "No se pudo ajustar Archify: cambió render-architecture.mjs" >&2; exit 1; }
ARCHIFY_CLI="$TEMPORAL/archify/bin/archify.mjs"

if [ "$#" -gt 0 ]; then VISTAS=("$@"); else
  # Solo las vistas publicadas (las que ya tienen HTML); un borrador sin HTML no se toca.
  VISTAS=(); for f in *.architecture.json; do [ -f "${f%.architecture.json}.html" ] && VISTAS+=("${f%.architecture.json}"); done
fi

for vista in "${VISTAS[@]}"; do
  node "$ARCHIFY_CLI" deliver architecture "$vista.architecture.json" "$vista.html" --quality standard --json > "$TEMPORAL/recibo.json" \
    || { cat "$TEMPORAL/recibo.json" >&2; exit 1; }

  # PDF del diagrama solo, con la página del tamaño del viewBox (si no, Chrome
  # lo parte en varias páginas carta).
  python3 - "$vista" "$TEMPORAL/imprimir.html" <<'EOF'
import json, pathlib, sys
vista, salida = sys.argv[1], sys.argv[2]
html = pathlib.Path(vista + '.html').read_text(encoding='utf-8')
ancho, alto = json.load(open(vista + '.architecture.json'))['meta']['viewBox']
css = ('<style>@page{size:%dpx %dpx;margin:0}@media print{.header,.cards,.diagram-guide{display:none!important}'
       '.container{padding:0!important;max-width:none!important}'
       '.diagram-container{margin:0!important;border:0!important;box-shadow:none!important}}</style></body>') % (ancho + 80, alto + 200)
pathlib.Path(salida).write_text(html.replace('</body>', css, 1), encoding='utf-8')
EOF
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 \
    --print-to-pdf="../ArchifyPDF/$vista.pdf" "file://$TEMPORAL/imprimir.html" 2>/dev/null
  pdfcrop --margins 6 "../ArchifyPDF/$vista.pdf" "../ArchifyPDF/$vista.pdf" > /dev/null
  echo "$vista: HTML y PDF regenerados"
done

python3 revisar-flechas.py $(printf '%s.html ' "${VISTAS[@]}")
