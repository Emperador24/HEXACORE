# Diagramas C4 interactivos (Archify)

Siete vistas de la arquitectura vigente (**ADR-16**), generadas con
[Archify](https://github.com/tt-a1i/archify) a partir de las especificaciones `JSON` de esta
carpeta. Abren en el navegador con zoom, búsqueda, foco y recorridos. Son la única fuente: los
PDF de `../ArchifyPDF/` se exportan desde estos HTML y las macros de `../Vigente/diagramas.tex`
los incluyen en el SAD, el documento C4 y los demás `.tex`.

Las vistas anteriores (ADR-14/15) se retiraron el 2/11/2026; están en el historial de git.
Las vistas 01, 02, 03, 04 y 07 se actualizaron el 14/11/2026.

| Vista | Fuente (editar aquí) | Interactivo | PDF |
|---|---|---|---|
| Nivel 1 — Contexto | `01-contexto.architecture.json` | `01-contexto.html` | `../ArchifyPDF/01-contexto.pdf` |
| Nivel 2 — Contenedores | `02-contenedores.architecture.json` | `02-contenedores.html` | `../ArchifyPDF/02-contenedores.pdf` |
| Nivel 3 — Componentes del Núcleo | `03-componentes-nucleo.architecture.json` | `03-componentes-nucleo.html` | `../ArchifyPDF/03-componentes-nucleo.pdf` |
| Nivel 3 — Componentes de Boletería | `04-componentes-boleteria.architecture.json` | `04-componentes-boleteria.html` | `../ArchifyPDF/04-componentes-boleteria.pdf` |
| Panorama de sistemas | `05-panorama.architecture.json` | `05-panorama.html` | `../ArchifyPDF/05-panorama.pdf` |
| Dinámica — Compra con turno (CU-001) | `06-secuencia.sequence.json` | `06-secuencia.html` | `../ArchifyPDF/06-secuencia.pdf` |
| Despliegue con Docker Compose | `07-despliegue.architecture.json` | `07-despliegue.html` | `../ArchifyPDF/07-despliegue.pdf` |
| Demostración en tres computadores (ZeroTier A/B/C) | `09-despliegue-zerotier.architecture.json` | `09-despliegue-zerotier.html` | `../ArchifyPDF/09-despliegue-zerotier.pdf` |

## Qué describen

- **Contexto:** cinco personas, todas con backend: el Organizador gestiona eventos, personal y
  parqueadero; el Supervisor, la evacuación y el panel en vivo. Pasarela y correo son externos,
  simulados en pruebas.
- **Contenedores:** gateway, Núcleo y Boletería replicables, Trabajador, la tarea `preparacion-base`
  (36 migraciones), monitoreo en `/grafana/`, PostgreSQL con once esquemas, Redis y RabbitMQ.
- **Componentes:** los siete módulos del Núcleo con la guarda común de sesión y permisos (CU-028),
  y los cinco de Boletería con sus trabajos en segundo plano, el módulo Pagos y `eventos.gestion`.
- **Secuencia:** turno gastado en el gateway, reserva, PAGANDO, cobro local, confirmación con
  outbox y proyección del QR. Señala lo que no garantiza (F12, convergencia del QR).
- **Despliegue:** perfiles `servicios` y `datos` de Compose, réplicas de Núcleo y Boletería, el
  monitoreo (exportador, Prometheus, Promtail, Loki y Grafana) e imágenes de GHCR.

Cada diagrama dibuja las relaciones principales; las que se omiten para que se lea están
enumeradas en la tarjeta «Relaciones no dibujadas» o «Relaciones resumidas» del propio HTML.

## Cómo regenerar después de editar un JSON

```bash
./regenerar.sh                      # todas las vistas publicadas
./regenerar.sh 02-contenedores      # solo una
```

El guion valida y entrega el HTML, exporta el PDF a `../ArchifyPDF/` (con la página del tamaño
del `viewBox`, recortado) y al final corre `revisar-flechas.py`. Termina con error si alguna vista
no pasa la validación o si alguna flecha comparte tramo con otra o llega al mismo punto de una
caja que otra. `06-secuencia` es de tipo `sequence` y se regenera aparte, con Archify directo.

**Por qué un guion y no Archify directo.** Cuando varias flechas llegan al mismo lado de una
caja, Archify las separa como mucho 14 px: las puntas se enciman y los tramos horizontales se
recorren unos encima de otros. El guion usa una copia temporal de Archify (la instalada no se
toca) que reparte esas flechas a lo largo de todo el lado. Para que bajen rectas, **el lado de la
caja mide lo mismo que el tramo entre los centros de las cajas con las que conecta, más 32 px**
(el margen de 16 px de cada esquina): por eso el gateway del Núcleo abarca los siete módulos y
HEXACORE, en el contexto, abarca a las cinco personas.

Después de regenerar, mirar el PDF: el revisor mide flechas, no la estética.

## Trampas conocidas

- **El validador no ve rótulos que se tapan entre sí ni flechas que comparten borde** (por eso
  existe `revisar-flechas.py`). En esta
  versión pasó dos veces: «webhook HMAC» encima de «cobros y reembolsos» en el contexto, y la
  entrada y salida del Trabajador sobre el mismo borde, que parecía una flecha bidireccional. La
  comprobación que vale es renderizar el PDF y mirarlo.
- **No usar el campo `tag`.** Al imprimir se dibuja encima del `sublabel`.
- **Rótulo de una flecha recta encima de su caja:** moverlo con `labelDy`, no con `labelAt`.
  `labelAt` (y `via`) sacan la flecha del reparto y la mandan al centro del lado, encima de las
  demás.
- **Aristas paralelas hacia un mismo nodo:** declarar `fromSide`/`toSide`; si no, el validador
  rechaza la dirección inferida.
- **`visual-check` del visor:** con el perfil `standard` y lienzos de ~1500 px, contexto y
  panorama aprueban; contenedores, componentes, secuencia y despliegue piden scroll a 1440×900 y
  sus subtítulos quedan bajo el mínimo legible al proyectarse. Se leen con zoom en el visor y
  completos en el PDF.
