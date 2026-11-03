# Diagramas C4 interactivos (Archify)

Siete vistas de la arquitectura vigente (**ADR-16**), generadas con
[Archify](https://github.com/tt-a1i/archify) a partir de las especificaciones `JSON` de esta
carpeta. Abren en el navegador con zoom, búsqueda, foco y recorridos. Son la única fuente: los
PDF de `../ArchifyPDF/` se exportan desde estos HTML y las macros de `../Vigente/diagramas.tex`
los incluyen en el SAD, el documento C4 y los demás `.tex`.

Las vistas anteriores (ADR-14/15) se retiraron el 2/11/2026; están en el historial de git.

| Vista | Fuente (editar aquí) | Interactivo | PDF |
|---|---|---|---|
| Nivel 1 — Contexto | `01-contexto.architecture.json` | `01-contexto.html` | `../ArchifyPDF/01-contexto.pdf` |
| Nivel 2 — Contenedores | `02-contenedores.architecture.json` | `02-contenedores.html` | `../ArchifyPDF/02-contenedores.pdf` |
| Nivel 3 — Componentes del Núcleo | `03-componentes-nucleo.architecture.json` | `03-componentes-nucleo.html` | `../ArchifyPDF/03-componentes-nucleo.pdf` |
| Nivel 3 — Componentes de Boletería | `04-componentes-boleteria.architecture.json` | `04-componentes-boleteria.html` | `../ArchifyPDF/04-componentes-boleteria.pdf` |
| Panorama de sistemas | `05-panorama.architecture.json` | `05-panorama.html` | `../ArchifyPDF/05-panorama.pdf` |
| Dinámica — Compra con turno (CU-001) | `06-secuencia.sequence.json` | `06-secuencia.html` | `../ArchifyPDF/06-secuencia.pdf` |
| Despliegue con Docker Compose | `07-despliegue.architecture.json` | `07-despliegue.html` | `../ArchifyPDF/07-despliegue.pdf` |

## Qué describen

- **Contexto:** cinco personas; Organizador y Supervisor van en línea discontinua porque sus
  casos (CU-026, Operación) no tienen backend. Pasarela y correo son externos, simulados en pruebas.
- **Contenedores:** gateway, Núcleo, Boletería, Trabajador, la tarea `preparacion-base`,
  Operación pendiente, PostgreSQL con ocho esquemas, Redis y RabbitMQ.
- **Componentes:** controladores, servicios, trabajos en segundo plano (cron, outbox,
  consumidores) y el módulo Pagos de cada programa, con sus colas reales.
- **Secuencia:** turno gastado en el gateway, reserva, PAGANDO, cobro local, confirmación con
  outbox y proyección del QR. Señala lo que no garantiza (F12, convergencia del QR).
- **Despliegue:** perfiles `servicios` y `datos` de Compose, réplicas de Boletería e imágenes de GHCR.

Cada diagrama dibuja las relaciones principales; las que se omiten para que se lea están
enumeradas en la tarjeta «Relaciones no dibujadas» o «Relaciones resumidas» del propio HTML.

## Cómo regenerar después de editar un JSON

```bash
A=~/.claude/skills/archify
# 1. Validar y entregar (perfil standard; debe terminar con ok: true)
node $A/bin/archify.mjs validate architecture 02-contenedores.architecture.json --quality standard --json
node $A/bin/archify.mjs deliver architecture 02-contenedores.architecture.json 02-contenedores.html --quality standard --json
# (para 06-secuencia usar el tipo "sequence")
```

2. Exportar el PDF ocultando el cromo del visor. **Fijar el tamaño de página al `viewBox`**: sin
   eso, Chrome parte los diagramas altos en varias páginas carta y la primera sale en blanco.

```bash
python3 -c "
import pathlib,json
n='02-contenedores'
h=pathlib.Path(n+'.html').read_text(encoding='utf-8')
w,hh=json.load(open(n+'.architecture.json'))['meta']['viewBox']
css='<style>@page{size:%dpx %dpx;margin:0}@media print{.header,.cards,.diagram-guide{display:none!important}.container{padding:0!important;max-width:none!important}.diagram-container{margin:0!important;border:0!important;box-shadow:none!important}}</style></body>'%(w+80,hh+200)
pathlib.Path('/tmp/print.html').write_text(h.replace('</body>',css,1),encoding='utf-8')"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=4000 \
  --print-to-pdf=../ArchifyPDF/02-contenedores.pdf file:///tmp/print.html
pdfcrop --margins 6 ../ArchifyPDF/02-contenedores.pdf ../ArchifyPDF/02-contenedores.pdf
```

3. Mirar el PDF. `visual-check` deja capturas y JSON junto al HTML: moverlos fuera del repositorio.

## Trampas conocidas

- **El validador no ve rótulos que se tapan entre sí ni flechas que comparten borde.** En esta
  versión pasó dos veces: «webhook HMAC» encima de «cobros y reembolsos» en el contexto, y la
  entrada y salida del Trabajador sobre el mismo borde, que parecía una flecha bidireccional. La
  comprobación que vale es renderizar el PDF y mirarlo.
- **No usar el campo `tag`.** Al imprimir se dibuja encima del `sublabel`.
- **Flechas verticales cortas:** su rótulo cae sobre el nodo; fijarlo con `labelAt`.
- **Aristas paralelas hacia un mismo nodo:** declarar `fromSide`/`toSide`; si no, el validador
  rechaza la dirección inferida.
- **`visual-check` del visor:** con el perfil `standard` y lienzos de ~1500 px, contexto y
  panorama aprueban; contenedores, componentes, secuencia y despliegue piden scroll a 1440×900 y
  sus subtítulos quedan bajo el mínimo legible al proyectarse. Se leen con zoom en el visor y
  completos en el PDF.
