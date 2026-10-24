# De ADR-12 a ADR-14 — distancia real y orden de migración

Mide lo que separa el sistema desplegado hoy del diseño de ADR-14, y ordena el
camino. **Nada de esto está hecho.** Lo que corre sigue siendo ADR-12: tres
servicios de dominio, RabbitMQ, Docker Compose y seis bases separadas.

Las rutas de este documento se verificaron contra el repositorio el 24 oct 2026.

## Dónde vive hoy cada servicio del diseño

### Los siete microservicios

| Servicio | CU | Dónde está hoy | Qué falta |
|---|---|---|---|
| **Cola virtual** | apoya CU-001 | — | Todo. No existe |
| **Catálogo** | CU-005 | `entradas-mercado-secundario/src/catalogo/` | Sacarlo a su propio despliegue y cambiar PostgreSQL por índice de búsqueda |
| **Ventas** | CU-001, CU-004 | `entradas-mercado-secundario/src/venta/` | Sacarlo; ya tiene reserva atómica en Redis |
| **Pagos** | pagos de CU-001/003/006/011/021 | **duplicado**: `nucleo/src/modulos/pedidos/pagos/` y `entradas-mercado-secundario/src/reventa/pagos/` | Unificar las dos copias en un servicio. Las llaves de idempotencia ya existen en ambas |
| **Autenticación** | CU-027, CU-028 | `nucleo/src/modulos/administracion/` | **Sacarlo del Núcleo** — revierte ADR-12 |
| **Acceso QR** | CU-002 | `entradas-mercado-secundario/src/venta/ingreso.service.ts` y `ingresos.controller.ts` | Sacarlo; añadir caché de estado y modo sin red |
| **Notificaciones** | transversal | `nucleo/src/modulos/administracion/notificaciones/` | Sacarlo; hoy solo manda correo, falta push y prioridad alta |

### Los siete servicios de dominio

| Servicio | CU | Dónde está hoy | Qué falta |
|---|---|---|---|
| **Eventos y recintos** | CU-026, CU-029 | CU-026 parcial en `entradas-mercado-secundario` | CU-029 entero; publicar eventos hacia Catálogo y Ventas |
| **Postventa** | CU-003, CU-006 | `entradas-mercado-secundario/src/reventa/` | Separarlo de Ventas; CU-003 entero |
| **Alimentos** | CU-011–015 | `nucleo/src/modulos/pedidos/` | **Sacarlo del Núcleo**; CU-013, 014 y 015 enteros |
| **Parqueaderos** | CU-021–025 | solo `nucleo/src/modulos/parqueaderos/README.md` | Todo |
| **Personal y logística** | CU-007–009, 016–018, 030 | `eventos-emergencias/src/logistica/` (CU-017, 018) | CU-007, 008, 009, 016 y 030 |
| **Operación del evento** | CU-010, 019, 020 | CU-019 en `eventos-emergencias` | CU-010 y CU-020 |
| **Finanzas y reportes** | CU-031, CU-032 | — | Todo, más la réplica de lectura |

### Resumen

- **14 unidades desplegables** frente a las 3 de hoy.
- **6 servicios desde cero**: Cola virtual, Pagos, Notificaciones, Parqueaderos, Finanzas, Eventos y recintos.
- **2 servicios se parten**: `entradas-mercado-secundario` en cuatro, `eventos-emergencias` en dos.
- **1 servicio se deshace**: el Núcleo, en Autenticación (microservicio) y Alimentos (dominio).
- **14 de 32 CU siguen sin backend.**

## La evidencia que ya está en el código

Dos cosas que el diseño predice y que el repositorio confirma:

**Pagos cumple el criterio 2 de forma visible.** La lógica de pasarela existe
hoy *dos veces*, en `pedidos/pagos/pasarela-http.service.ts` y en
`reventa/pagos/pasarela-http.service.ts`. Dos dominios distintos, el mismo
problema resuelto dos veces. Es el argumento más concreto para extraerlo.

**Las llaves de idempotencia ya están puestas.** Es la parte de la Saga que
suele olvidarse y aquí existe en los dos caminos de pago. Al unificar Pagos no
hay que diseñarla, solo elegir cuál de las dos versiones queda.

**Las costuras para partir Entradas ya existen.** Sus módulos internos se llaman
`catalogo/`, `venta/` y `reventa/`, que es casi exactamente la división que pide
ADR-14. `ingreso.service.ts` dentro de `venta/` es el Acceso QR. Partirlo es
mover carpetas, no rediseñar.

## Orden propuesto

Cada fase deja el sistema funcionando. El criterio del orden es: **primero lo
que tiene costura, después lo que hay que construir, al final la
infraestructura** — porque cambiar el broker y el orquestador con el código a
medias multiplica los frentes abiertos.

### Fase A — Partir Entradas en cuatro

De 3 deployables a 6. Catálogo, Ventas, Acceso QR y Postventa salen de
`entradas-mercado-secundario`, cada uno con su base.

Es la fase con mejor relación entre beneficio y riesgo: las costuras existen, y
deja operativos cuatro de los siete microservicios. El punto delicado es que
Ventas y Postventa comparten hoy las tablas de entradas y publicaciones; hay que
decidir cuál de los dos se queda con `entrada.entity.ts` (debería ser Ventas,
porque es quien cambia el dueño) y cómo se entera el otro.

### Fase B — Deshacer el Núcleo

De 6 a 7. Autenticación sale como microservicio con base y Redis propios;
Alimentos queda como servicio de dominio.

Revierte lo de ADR-12. La buena noticia: el trabajo de ayer dejó los dos
dominios como módulos separados con conexión nombrada propia
(`src/modulos/administracion/` y `src/modulos/pedidos/`), así que separarlos es
deshacer el `app.module.ts` y duplicar la configuración — mucho más fácil que
antes de la fusión.

### Fase C — Extraer Pagos y Notificaciones

De 7 a 9. Son los dos transversales que hoy están duplicados o enterrados dentro
de un dominio.

Pagos ya resuelve la idempotencia en las dos copias —`pagos.service.ts` rechaza
una clave reusada con otro pedido (`CLAVE_IDEMPOTENCIA_INCOMPATIBLE`) y
`procesador-pagos.ts` usa el id de la transacción como clave—, así que unificar
es escoger una de las dos implementaciones, no escribirla. Lo que falta es que
la clave sobreviva al reinicio: hoy el simulador no consulta estado, y por eso
un pago FALLIDO no se reenvía.

### Fase D — Cola virtual y Catálogo con índice de búsqueda

De 9 a 10. Cola virtual es un servicio nuevo pequeño pero es el que sostiene el
primer ASR. El Catálogo cambia su almacén por un índice alimentado por eventos,
lo que introduce la primera consistencia eventual del sistema.

### Fase E — La Saga de CU-001 completa

Sin servicios nuevos. Ventas orquesta la compra de punta a punta con
compensación: reserva atómica con vencimiento, orden pendiente, cobro
idempotente, confirmación y liberación si el pago falla o vence. Hoy hay partes
—la reserva atómica ya está medida en 1 de 50 compradores— pero no la
orquestación con compensación.

### Fase F — La infraestructura del diseño

Broker con tópicos replicados en lugar de RabbitMQ, clúster con autoescalado
horizontal en lugar de Docker Compose, CDN para los frontends, réplica de lectura
para Finanzas. **Es la fase más cara y la que menos se nota en una demostración**,
porque el sistema ya funcionaba antes.

### Fase G — Los dominios sin implementar

Parqueaderos, Finanzas, Eventos y recintos completo, y los CU que faltan de
Personal y de Operación. Son los 14 casos de uso sin backend.

## Lo que conviene decidir antes de empezar

1. **¿Se ejecuta por fases o se documenta como diseño objetivo?** Las fases A a
   G son semanas de trabajo. Un SAD puede describir una arquitectura objetivo y
   declarar qué parte está implementada; es legítimo y es más honesto que
   describir 14 servicios y desplegar 3.

2. **La Fase B revierte trabajo reciente.** Antes de deshacer el Núcleo conviene
   confirmar que el criterio de ADR-14 es el definitivo, porque es la segunda vez
   que esa frontera se mueve.

3. **Kafka y Kubernetes no son gratis.** Cambiar el broker invalida las pruebas
   de integración que hoy miden consistencia y disponibilidad, y el clúster
   cambia `iniciar.sh` entero, que es la evidencia de desplegabilidad.

4. **Qué pasa con las mediciones.** Los cuatro atributos medidos hoy
   —`App/infra/informe-atributos/INFORME.md`— se tomaron contra la arquitectura
   de ADR-12. Después de cada fase hay que volver a correr
   `App/infra/atributos-calidad.py`, y los umbrales de los ASR nuevos (cola
   virtual, validación de QR sin red) todavía no tienen suite.
