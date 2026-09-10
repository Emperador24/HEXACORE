# Diagramas C4 (Archify)

**Esta es la fuente oficial de los diagramas C4 del proyecto.** Los seis diagramas se generan con
[Archify](https://github.com/tt-a1i/archify) a partir de las especificaciones `JSON` de esta
carpeta, y son los que se insertan en `C4Diagrams.tex` y en `DescripcionArquitecturaSoftware.tex`.

Los `.drawio`/`.png` de la carpeta padre son la versión anterior (hecha a mano en draw.io) y se
conservan solo como referencia histórica: **ya no se usan en ningún documento**.

## Por qué se cambió a Archify

La versión de draw.io se desactualizaba en silencio cada vez que cambiaba una decisión: describía
una sola "App Móvil" genérica y cuatro microservicios, cuando el repo ya tenía otra estructura.
Al estar la especificación en un archivo de texto versionado, un cambio como ADR-07 (unificar las
apps móviles de Cliente y Personal en una sola) se refleja editando el `JSON` y regenerando, y la
diferencia queda visible en el diff del commit.

## Archivos

| Diagrama | Fuente (editar aquí) | Interactivo | PDF que usa el `.tex` |
|---|---|---|---|
| Nivel 1 — Contexto | `01-contexto.architecture.json` | `01-contexto.html` | `../ArchifyPDF/01-contexto.pdf` |
| Nivel 2 — Contenedores | `02-contenedores.architecture.json` | `02-contenedores.html` | `../ArchifyPDF/02-contenedores.pdf` |
| Nivel 3 — Componentes (Entradas, CU-006) | `03-componentes.architecture.json` | `03-componentes.html` | `../ArchifyPDF/03-componentes.pdf` |
| Panorama de Sistemas | `04-panorama.architecture.json` | `04-panorama.html` | `../ArchifyPDF/04-panorama.pdf` |
| Secuencia — Reventa (CU-006) | `05-secuencia.sequence.json` | `05-secuencia.html` | `../ArchifyPDF/05-secuencia.pdf` |
| Despliegue | `06-despliegue.architecture.json` | `06-despliegue.html` | `../ArchifyPDF/06-despliegue.pdf` |

Los `.html` son autocontenidos: se abren directamente en el navegador, sin servidor.

## Cómo regenerar después de editar un JSON

```bash
SKILL=~/.claude/skills/archify
cd "$SKILL"

# 1. Regenerar el HTML (valida geometría y solapamientos; debe terminar con errors: 0)
node bin/archify.mjs deliver architecture <ruta>/02-contenedores.architecture.json \
     <ruta>/02-contenedores.html --quality standard --json
# (para 05-secuencia usar el tipo "sequence")

# 2. Exportar el PDF que consume LaTeX: se oculta el cromo del visor y se recorta el sobrante
python3 -c "
import pathlib
h=pathlib.Path('02-contenedores.html').read_text(encoding='utf-8')
css='<style>@media print{.header,.cards,.diagram-guide{display:none!important}.container{padding:0!important}.diagram-container{margin:0!important;border:0!important;box-shadow:none!important}}</style></body>'
pathlib.Path('/tmp/print.html').write_text(h.replace('</body>',css,1),encoding='utf-8')"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf=../ArchifyPDF/02-contenedores.pdf file:///tmp/print.html
pdfcrop --margins 6 ../ArchifyPDF/02-contenedores.pdf ../ArchifyPDF/02-contenedores.pdf
```

Archify trae su propio bloque `@media print` que fuerza la paleta clara, así que el PDF sale legible
aunque el `HTML` abra en tema oscuro.

## Trampa conocida

**No usar el campo `tag` de Archify.** En el visor interactivo queda oculto, pero al imprimir se
dibuja encima del `sublabel` y los textos se solapan. Si hace falta esa información (roles, rangos
de CU), va dentro del `sublabel` — así está hecho hoy en `02-contenedores`.
