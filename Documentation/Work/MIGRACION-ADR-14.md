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
| **Catálogo** | CU-005 | ✅ `services/catalogo/` — despliegue propio y base propia | Cambiar PostgreSQL por índice de búsqueda (fase D) |
| **Ventas** | CU-001, CU-004 | `entradas-mercado-secundario/src/venta/` | Sacarlo; ya tiene reserva atómica en Redis |
| **Pagos** | pagos de CU-001/003/006/011/021 | **duplicado**: `nucleo/src/modulos/pedidos/pagos/` y `entradas-mercado-secundario/src/reventa/pagos/` | Unificar las dos copias en un servicio. Las llaves de idempotencia ya existen en ambas |
| **Autenticación** | CU-027, CU-028 | ✅ `services/autenticacion/` — despliegue y base propios | Nada estructural |
| **Acceso QR** | CU-002 | `entradas-mercado-secundario/src/venta/ingreso.service.ts` y `ingresos.controller.ts` | Sacarlo; añadir caché de estado y modo sin red |
| **Notificaciones** | transversal | ✅ `services/notificaciones/` — sin base: su estado es la cola | Falta push y prioridad alta |

### Los siete servicios de dominio

| Servicio | CU | Dónde está hoy | Qué falta |
|---|---|---|---|
| **Eventos y recintos** | CU-026, CU-029 | CU-026 parcial en `entradas-mercado-secundario` | CU-029 entero; publicar eventos hacia Catálogo y Ventas |
| **Postventa** | CU-003, CU-006 | `entradas-mercado-secundario/src/reventa/` | Separarlo de Ventas; CU-003 entero |
| **Alimentos** | CU-011–015 | ✅ `services/alimentos/` — despliegue y base propios | CU-013, 014 y 015 enteros |
| **Parqueaderos** | CU-021–025 | solo `nucleo/src/modulos/parqueaderos/README.md` | Todo |
| **Personal y logística** | CU-007–009, 016–018, 030 | `eventos-emergencias/src/logistica/` (CU-017, 018) | CU-007, 008, 009, 016 y 030 |
| **Operación del evento** | CU-010, 019, 020 | CU-019 en `eventos-emergencias` | CU-010 y CU-020 |
| **Finanzas y reportes** | CU-031, CU-032 | — | Todo, más la réplica de lectura |

### Resumen

- **14 unidades desplegables** frente a las **6 de hoy**: Autenticación, Notificaciones, Alimentos, Catálogo, Entradas y Eventos/Emergencias.
- **6 servicios desde cero**: Cola virtual, Pagos, Notificaciones, Parqueaderos, Finanzas, Eventos y recintos.
- **2 servicios se parten**: `entradas-mercado-secundario` en cuatro, `eventos-emergencias` en dos.
- ~~**1 servicio se deshace**: el Núcleo~~ — ✅ hecho: quedó en Autenticación (microservicio), Notificaciones (microservicio) y Alimentos (dominio).
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

### Fase A — Partir Entradas

**Corregido el 27 oct 2026, al ejecutarla.** Este documento decía que la fase A
era «la de mejor relación entre beneficio y riesgo» porque «las costuras
existen». Las costuras existen en las **carpetas**, no en los **datos**. De los
cuatro servicios que se iban a extraer, solo uno sale limpio.

#### A1 — Catálogo ✅ hecho

De 3 deployables a 4. Sale limpio porque **no escribe nada**: sus dos tablas
(`eventos_referencia`, `localidades_evento`) son una proyección de sólo lectura
que hoy puebla la semilla y mañana alimentará `EventoPublicado`. No comparte
ninguna transacción con el resto.

Su copia lleva solo lo que la cartelera lee: `permite_reventa` se queda en
Postventa y `aforo_maximo`/`asistentes` en Acceso QR.

#### A2 y A3 — Acceso QR y Postventa: **no son un movimiento de carpetas**

Los dos escriben `Entrada` —que es de Ventas— dentro de una transacción ACID, y
en los dos casos esa transacción es lo que sostiene un atributo de calidad
medido:

| Servicio | Qué hace la transacción | Qué se rompe al separarla |
|---|---|---|
| **Acceso QR** | marca la entrada `USADA`, suma al aforo y guarda el `Ingreso` | si el aforo está lleno **se deshace todo y el QR no queda marcado**. Separada, alguien puede quedarse fuera con su entrada ya gastada |
| **Postventa** | cierra la publicación, transfiere la entrada y cambia el QR, y escribe el historial | el `UPDATE` condicionado es la última defensa contra la doble venta (RNF-01/02), y el cambio de QR atómico es lo que hace que *nunca* haya dos códigos válidos a la vez |

Separarlos convierte las dos en Sagas con compensación, igual que CU-001. Eso
**no es la fase A**: es trabajo de diseño del mismo tamaño que la fase E, y
debería ir después de ella, cuando el patrón de Saga ya esté construido y
medido una vez.

#### Orden revisado

- **A1. Catálogo** — hecho.
- **A2. Ventas** — lo que queda de `entradas-mercado-secundario` tras sacar
  Catálogo, Acceso QR y Postventa. Depende de las dos de abajo.
- Acceso QR y Postventa pasan **después de la fase E**, cuando la Saga de CU-001
  esté funcionando y se pueda reutilizar el patrón en vez de inventarlo tres
  veces.

### Fase B — Deshacer el Núcleo ✅ hecha

De 4 a 6 deployables. El Núcleo se repartió en tres:

- **Notificaciones** → microservicio. Era el corte más limpio del proyecto: la
  costura ya existía y nadie la había visto. Autenticación nunca llamó a
  Notificaciones, publicaba al broker; separarlos fue quedarse cada uno con su
  mitad. No tiene base de datos: su estado es la cola.
- **Alimentos** → servicio de dominio. No cumple dos criterios —carga estable,
  ningún otro dominio lo usa—, así que dos réplicas fijas.
- **Autenticación** → lo que quedó, renombrado.

Dos cosas se simplificaron solas al separar, y las dos venían de compartir
proceso: las **conexiones nombradas** de ADR-12 desaparecen (con una sola base
el mecanismo sobra) y Alimentos pasa a cargar **solo la clave pública**, porque
ya no convive con quien firma.

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
