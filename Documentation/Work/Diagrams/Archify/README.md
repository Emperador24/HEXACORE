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
| Nivel 3 — Componentes (Ventas) | `03-componentes.architecture.json` | `03-componentes.html` | `../ArchifyPDF/03-componentes.pdf` |
| Panorama de Sistemas | `04-panorama.architecture.json` | `04-panorama.html` | `../ArchifyPDF/04-panorama.pdf` |
| Secuencia — Compra con Saga (CU-001) | `05-secuencia.sequence.json` | `05-secuencia.html` | `../ArchifyPDF/05-secuencia.pdf` |
| Despliegue | `06-despliegue.architecture.json` | `06-despliegue.html` | `../ArchifyPDF/06-despliegue.pdf` |

## Una sola versión de cada vista

Los seis diagramas describen **ADR-14** y son los que insertan `DescripcionArquitecturaSoftware.tex`,
`C4Diagrams.tex` y `Presentacion.tex`. No hay variantes «objetivo» frente a «desplegado»: si quieres
ver cómo era la arquitectura de ADR-12, está en el historial de git, no en esta carpeta.

`01-contexto` y `04-panorama` no cambiaron al pasar de ADR-12 a ADR-14, y es correcto: dibujan
actores y sistemas externos, que son los mismos con 3 servicios o con 14.

**Ojo al editar.** Los diagramas describen la arquitectura *decidida*, y lo desplegado todavía es
ADR-12 (tres servicios sobre Docker Compose). Esa distancia está medida en
`../../MIGRACION-ADR-14.md`. Si cambias un diagrama para que se parezca más a lo que corre hoy,
estás deshaciendo ADR-14 sin un ADR que lo justifique.

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

## Trampa conocida: `deliver` falla aunque el diagrama esté bien

En `02-contenedores`, con 33 relaciones, `archify deliver` y `archify validate` revientan con
`Could not parse the successful artifact-check receipt` o `Unterminated string in JSON`. **No es el
diagrama.** `bin/archify.mjs` lanza el comprobador con `spawnSync` y lee su salida por un tubo que
corta a 64 KB; el informe de este diagrama ocupa 146 KB. El propio mensaje lo delata: dice
*successful* artifact-check.

La vuelta es hacer los dos pasos a mano, escribiendo a fichero en vez de a un tubo:

```bash
A=~/.claude/skills/archify
node $A/renderers/architecture/render-architecture.mjs 02-contenedores.architecture.json /tmp/t.html --quality standard
node $A/scripts/check-render-output.mjs /tmp/t.html > /tmp/check.json   # ok:true y 9 comprobaciones
cp /tmp/t.html 02-contenedores.html
```

Después se genera el PDF como se explica arriba.

## Trampa conocida

**No usar el campo `tag` de Archify.** En el visor interactivo queda oculto, pero al imprimir se
dibuja encima del `sublabel` y los textos se solapan. Si hace falta esa información (roles, rangos
de CU), va dentro del `sublabel` — así está hecho hoy en `02-contenedores`.

**El validador no ve los rótulos que se tapan entre sí.** Dio 0 errores con «busca» encima de
«reserva atómica», y el PDF leía `rese...ómica`. La comprobación que vale es **renderizar el PDF y
mirarlo**; el informe de Archify avisa de choques de ruta, no de máscaras de texto superpuestas.

**Los avisos cuentan.** Este diagrama tolera avisos con el perfil `standard`, pero cuando pasaron de
20 a 120 al añadir flechas, el dibujo era ilegible de verdad. Si el número se dispara, el diagrama
está saturado: separa filas o quita flechas antes que seguir recolocando rótulos.

**El `viewBox` tiene que caber en pantalla.** Archify valida legibilidad contra un
navegador de 1440 px: un lienzo de más de ~1500 px de ancho hace que los `sublabel`
bajen de 6 px al proyectarse y la entrega falla. Si el diagrama no cabe, reorganiza en
menos columnas antes que ensanchar — así se resolvió `03-componentes`, que pasó de cinco
columnas a cuatro apilando Controlador y Orquestador.
