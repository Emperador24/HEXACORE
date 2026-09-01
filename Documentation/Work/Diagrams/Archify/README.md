# Diagramas C4 (Archify)

Versión interactiva (HTML explorable: pan/zoom, tema claro/oscuro, guided views) de los 6 diagramas
C4 del sistema, generados con [Archify](https://github.com/tt-a1i/archify) a partir del estado
**actual** del repo (`App/frontend/*`, `App/gateway`, `App/services/*`), no de la versión anterior en
`../02-Contenedores.png` etc.

## Por qué existen dos versiones

Los PNG en `../` (embebidos en `C4Diagrams.tex`, SAD v1.1) describen una arquitectura **desactualizada**:
una sola "App Móvil" compartida entre Cliente y Personal, y solo 4 microservicios. El repo ya
evolucionó a **4 apps de frontend separadas** (`app-movil-cliente`, `app-movil-personal`,
`portal-web-admin`, `portal-web-cliente`) y **6 microservicios** (`personal`, `pedidos`,
`entradas-mercado-secundario`, `parqueaderos`, `eventos-emergencias`, `administracion` — ver los
`README.md` de cada uno en `App/services/`). Estos 6 archivos reflejan esa estructura real.

## Archivos

| Diagrama | HTML | Fuente |
|---|---|---|
| Nivel 1 — Contexto | `01-contexto.html` | `01-contexto.architecture.json` |
| Nivel 2 — Contenedores | `02-contenedores.html` | `02-contenedores.architecture.json` |
| Nivel 3 — Componentes (Servicio de Entradas, CU-006) | `03-componentes.html` | `03-componentes.architecture.json` |
| Panorama de Sistemas | `04-panorama.html` | `04-panorama.architecture.json` |
| Secuencia — Reventa de una entrada (CU-006) | `05-secuencia.html` | `05-secuencia.sequence.json` |
| Despliegue | `06-despliegue.html` | `06-despliegue.architecture.json` |

Cada `.html` es autocontenido — se abre directamente en el navegador, sin servidor.

## Cómo regenerarlos

```bash
cd /Users/samuel/.claude/skills/archify
node bin/archify.mjs deliver architecture <archivo>.architecture.json <salida>.html --quality standard
node bin/archify.mjs deliver sequence 05-secuencia.sequence.json 05-secuencia.html --quality standard
```

Nota: en el Nivel 2 (Contenedores), por legibilidad solo se dibuja el detalle completo de aristas del
Servicio de Entradas hacia Bases de Datos/Redis/Cola/Pasarela; los otros 5 microservicios siguen el
mismo patrón (documentado en las tarjetas del propio diagrama) pero no se dibuja cada arista para no
saturar el lienzo.
