# Servicio de Entradas y Mercado Secundario

SAD §9 (vista de componentes), CU-001–CU-006. **NestJS** (ADR-09) + **PostgreSQL** (ADR-01, ADR-06).

**Responsabilidad:** consulta de eventos, compra de entradas, validación de QR en el ingreso,
cancelaciones/devoluciones, promociones (CU-001–005) y reventa segura de entradas en el mercado
secundario (CU-006, caso complejo — hilo conductor del SAD).

**ASR relacionados:** ASR-01 (bloqueo de doble venta), ASR-04 (respuesta bajo carga en apertura de
venta), ASR-06 (escalado independiente), ASR-07 (auditoría de transferencias).

**Responsables:** Daniel Cristancho (CU-001–005), Samuel Emperador (CU-006).

## Cómo levantarlo

```bash
# 1. Infraestructura compartida (PostgreSQL, Redis, RabbitMQ)
docker compose -f ../../infra/docker-compose.yml up -d

# 2. Este servicio
npm install
cp .env.example .env
npm run start:dev
```

- API: <http://localhost:3001/api/v1>
- Documentación OpenAPI: <http://localhost:3001/api/v1/docs> (solo fuera de producción)
- Sonda de vida: <http://localhost:3001/api/v1/salud>
- Consola de RabbitMQ: <http://localhost:15672> (`hexacore` / `hexacore`)

En producción este servicio **no se expone directo**: se consume a través del API Gateway (ADR-02),
que es quien autentica y autoriza por rol antes de enrutar (RNF-06).

## Estado de implementación

| Paso | Alcance | Estado |
|---|---|---|
| 1 | Andamiaje, infraestructura local y configuración validada | ✅ |
| 2 | Modelo de datos, migración y semilla de desarrollo | ✅ |
| 3 | Publicación en el mercado — CU-006 pasos 1–4, alternos 006A/006B, excepciones 006E/006F | ✅ |
| 4 | Consulta del mercado — CU-006 paso 5 | ✅ |
| 5 | Checkout con bloqueo distribuido — CU-006 paso 6, alterno 006C, excepción 006H | ✅ |
| 6 | Pago, transferencia, QR e historial — CU-006 pasos 7–11, excepciones 006G/006I | ✅ |
| 7 | `ENTRADA_TRANSFERIDA` y consumidores asíncronos — CU-006 pasos 12–13 | ✅ |
| 8 | Expiración de publicaciones — alterno CU-006D | ✅ |
| 9 | Pruebas (incl. RNF-01: 50 compras concurrentes) y contrato en `App/shared/` | ✅ |

CU-001–005 son de Daniel y se añadirán como módulos hermanos sobre esta misma base de datos.

## Componentes internos (SAD §9)

El código está organizado para que cada componente del diagrama tenga un lugar identificable:

| Componente del SAD | Dónde vive | Responsabilidad |
|---|---|---|
| Controlador API | `src/reventa/*.controller.ts` | Recibe la solicitud del gateway y delega |
| Servicio de Publicación | `src/reventa/publicacion.service.ts` | Orquesta toda la operación de reventa |
| Gestor de Concurrencia | `src/reventa/concurrencia/` | Bloqueo temporal en Redis (ADR-03) |
| Procesador de Pagos | `src/reventa/pagos/` | Cobro contra la Pasarela de Pagos |
| Generador de QR | `src/reventa/qr/` | Invalida el código anterior y emite el nuevo |
| Repositorio de Entradas | `src/persistencia/` | Lee y persiste entradas y publicaciones |
| Publicador de Eventos | `src/reventa/eventos/` | Publica `ENTRADA_TRANSFERIDA` en RabbitMQ (ADR-10) |

(Las carpetas de `src/reventa/` se crean en los pasos 3–7.)

`src/persistencia/` está a nivel de servicio y no dentro de `reventa/` porque la tabla `entradas`
la comparten los seis casos de uso: CU-001 escribe en ella y CU-002 lee de ella.

## Modelo de datos

| Tabla | Origen | Para qué |
|---|---|---|
| `entradas` | SAD §12 | La boleta. CU-006 no la crea, solo le cambia dueño y QR |
| `publicaciones_reventa` | SAD §12 (+ 3 campos) | La oferta en el mercado |
| `transacciones_reventa` | **nueva** | El movimiento de dinero de cada checkout |
| `historial_propietarios` | **nueva** | Cadena auditable de dueños, de solo inserción |
| `eventos_referencia` | **nueva** | Copia local de los datos del Evento que hacen falta |

Las tres tablas nuevas y los campos añadidos están justificados en [`DECISIONES.md`](DECISIONES.md).

```bash
npm run migracion:correr     # aplica el esquema
npm run migracion:estado     # qué migraciones están aplicadas
npm run migracion:revertir   # deshace la última
npm run semilla              # datos de desarrollo (no corre en producción)
```

La semilla crea 3 usuarios, 4 eventos y 8 entradas, y **cada entrada existe para ejercitar un camino
concreto** del CU-006: una para el camino feliz, una para CU-006A/B, una para las compras
simultáneas de CU-006H, una para los fallos de pago CU-006G/I, dos para CU-006E (usada e
invalidada), una para CU-006F (evento sin reventa) y una para CU-006D (evento ya celebrado). La
lista se imprime al sembrar.

Suple así el requisito previo que la propia ficha del CU-006 declara —*"CU-001: Compra de entradas
(requisito previo para poseer una entrada a revender)"*— sin invadir ese caso de uso: escribe
directamente en la base y no expone ningún endpoint de alta de entradas.

## Endpoints

Todos exigen la cabecera `X-Usuario-Id`. **Es provisional**: la identidad la aportará el API Gateway
(ADR-02, RNF-06) y esa cabecera es falsificable — por eso la *autorización* (que quien publica sea
de verdad el dueño de la entrada) se comprueba siempre contra la base de datos, nunca contra lo que
diga el cliente.

| Método | Ruta | CU-006 |
|---|---|---|
| `GET` | `/reventa/mis-entradas` | Paso 1 — entradas de la cuenta, con `puedePublicarse` ya resuelto |
| `POST` | `/reventa/publicaciones` | Pasos 2–4 — validar y publicar |
| `PATCH` | `/reventa/publicaciones/:id` | CU-006A — cambiar el precio |
| `DELETE` | `/reventa/publicaciones/:id` | CU-006B — retirar del mercado |
| `GET` | `/reventa/publicaciones` | Paso 5 — consultar el mercado |
| `GET` | `/reventa/publicaciones/:id` | Paso 5 — detalle de la publicación elegida |
| `POST` | `/reventa/publicaciones/:id/checkout` | Paso 6 — reservar con bloqueo en Redis |
| `GET` | `/reventa/checkout/:id` | Estado de la reserva y segundos restantes |
| `POST` | `/reventa/checkout/:id/pagar` | Pasos 7–11 — cobrar, transferir, reemitir QR y auditar |
| `POST` | `/reventa/mantenimiento/expirar-publicaciones` | CU-006D — forzar el barrido (operación de mantenimiento) |
| `DELETE` | `/reventa/checkout/:id` | CU-006C — cancelar y liberar el bloqueo |

Los errores traen el **código del camino de la ficha** para que la trazabilidad se vea desde fuera:

```
403 NO_ES_PROPIETARIO      pre-condición 1
409 CU-006E                entrada usada o anulada
409 CU-006F                el evento no permite reventa
409 CU-006D                la ventana de reventa ya se cerró
409 ENTRADA_YA_PUBLICADA   respaldado por el índice único parcial
409 CU-006H                otra persona está comprando esa publicación
409 CHECKOUT_NO_VIGENTE    el checkout ya se resolvió o su reserva caducó
409 CU-006G                la pasarela rechazó el cobro
409 COBRADO_SIN_TRANSFERIR  se cobró pero otro comprador se adelantó; requiere conciliación
503 CU-006I                la pasarela no respondió; NO se sabe si se cobró
422 PRECIO_SOBRE_TOPE      trae precioMaximo y factor, para poder explicarlo
```

El listado del mercado acepta `eventoId`, `orden` (`recientes`, `precio_asc`, `precio_desc`,
`evento_proximo`), `limite` y `desplazamiento`, y aplica tres reglas que **no** están en el cliente:
solo publicaciones `ACTIVA`, solo dentro de su ventana de reventa (una publicación caducada sigue
`ACTIVA` en la base hasta que el paso 8 la cierre) y nunca las del propio solicitante.

Tampoco devuelve el `vendedorId` a los compradores: quien compra necesita saber qué se vende y a qué
precio, no quién lo vende. El vendedor sí ve el suyo en `mis-entradas`, porque ahí es su cuenta.

`mis-entradas` devuelve `puedePublicarse`, `motivoBloqueo` y `precioMaximo` ya calculados. Es
deliberado: RNF-14 exige *"0 reglas de negocio duplicadas en el cliente"*, así que ni el móvil ni el
portal reimplementan "puede revenderse si está VALIDA y el evento lo permite y no ha empezado".

## El bloqueo del checkout (ADR-03, ASR-01)

El paso 6 reserva la publicación con un `SET NX PX` en Redis. Tres detalles que no son opcionales:

- **El bloqueo vive solo en Redis, no en PostgreSQL.** La tabla de publicaciones no tiene estado
  `EN_CHECKOUT` a propósito: si el proceso muere a mitad, el TTL libera la publicación solo, mientras
  que una columna en Postgres quedaría marcada para siempre. Es el mismo razonamiento con el que
  ADR-03 descartó el bloqueo pesimista en la base relacional.
- **Se libera comparando y borrando de forma atómica**, con un script Lua. Un `DEL` a secas tiene una
  carrera real: si el checkout se demoró más que el TTL, Redis ya lo expiró y otra persona pudo
  tomarlo; borrarlo entonces liberaría *el bloqueo ajeno*.
- **Se valida dos veces**: antes de bloquear (para no bloquear algo que se iba a rechazar) y después
  (porque entre medias el vendedor pudo retirar la publicación).

Si quien pide el checkout **ya tenía uno abierto** sobre esa publicación, se le devuelve el suyo en
lugar de rechazarlo. Sin eso, volver atrás y pulsar otra vez dejaría al comprador fuera de su propia
compra durante los dos minutos del TTL.

### Tres barreras, no una

El bloqueo de Redis no basta por sí solo, porque puede caducar entre reservar y
pagar. RNF-01 se sostiene sobre tres comprobaciones encadenadas:

1. **`SET NX` al reservar** — solo uno gana la publicación.
2. **`esTitular` al pagar** — el bloqueo tiene que ser *de este checkout*, no
   uno cualquiera. Preguntar solo si existe deja pasar a quien perdió su reserva
   mientras otro la tomaba.
3. **`UPDATE ... WHERE estado = 'ACTIVA'`** al transferir — si dos pagos entran
   en vuelo y ambos superan lo anterior, solo uno afecta filas; el otro se
   aborta con `COBRADO_SIN_TRANSFERIR` y queda marcado para conciliación.

Las tres hacen falta. Con solo la primera, el sistema cobraba dos veces la misma
entrada y emitía dos códigos QR (ver más abajo).

### Evidencia de RNF-01

```bash
python3 pruebas/rnf01-concurrencia.py    # con el servicio levantado
```

```
A. 50 compradores reservan a la vez -> 1 checkout, 49 rechazos CU-006H
B. Pagar con la reserva caducada    -> rechazado; la entrada va a quien sí la tenía
C. Los dos pagan a la vez           -> 1 pago, 1 cobro, 1 QR
```

**B y C se añadieron después de que una revisión los destapara**, y en su momento
fallaron: el escenario C llegaba a *2 cobros, 2 transferencias y 2 códigos QR*
sobre una sola entrada. La prueba A pasaba en verde todo ese tiempo porque solo
ejercita el momento de reservar — una prueba de concurrencia únicamente cubre el
punto exacto donde se aplica.

## El pago y sus dos formas de fallar

Rechazado e "incomunicado" **no son lo mismo**, y confundirlos es el peor error posible aquí:

| | Qué se sabe | Qué se hace |
|---|---|---|
| **CU-006G** rechazado | Con certeza, **no hubo cargo** | Transacción `RECHAZADA`, **se libera el bloqueo** y la publicación vuelve al mercado al instante |
| **CU-006I** sin respuesta | **No se sabe si hubo cargo** | Transacción `FALLIDA`, **el bloqueo NO se libera**, y se responde 503 con `requiereConciliacion` |

Por eso el adaptador de pagos devuelve tres resultados y no dos, y su `catch` nunca devuelve
"rechazado": ante la duda, `INDETERMINADO`. El mensaje al comprador tampoco promete que no se cobró
— decirle "no se cobró" y que luego aparezca el cargo sería peor que admitir la incertidumbre.

### La ventana de "cobrado y no entregado"

El diagrama de secuencia cobra **antes** de transferir en la base. Eso deja una ventana real que no
se puede eliminar sin un protocolo de dos fases que ninguna pasarela ofrece. Se acota así:

1. **La referencia del cobro se persiste antes de transferir.** Si la transferencia falla, queda una
   transacción `PENDIENTE` *con referencia de pasarela* — la señal inequívoca para conciliar.
2. **El cobro es idempotente** (la clave es el id de la transacción): reintentar no cobra dos veces.
3. La transferencia entera va en **una sola transacción de base de datos**: cambian el dueño, el QR,
   la publicación y el historial, o no cambia nada.

La consulta que encuentra lo que hay que revisar a mano:

```sql
SELECT numero_transaccion, estado, referencia_pasarela
FROM transacciones_reventa
WHERE estado = 'FALLIDA' OR (estado = 'PENDIENTE' AND referencia_pasarela IS NOT NULL);
```

### Sustituir el proveedor de pagos (RNF-16)

El dominio depende de la interfaz `ProcesadorPagos`, no del cliente HTTP. Cambiar de proveedor es
escribir otra implementación y cambiar una línea en `reventa.module.ts` — el requisito dice
*"componentes a modificar: 1 (solo el adaptador), 0 cambios en el servicio de Entradas"*.

### Evidencia

```bash
python3 pruebas/cu006-flujo-completo.py    # con el servicio levantado
```

Recorre el flujo básico y los tres fallos de pasarela, y comprueba en la base las post-condiciones:
propiedad cambiada, QR anterior inexistente (RNF-02) y cadena `EMISION -> REVENTA` en el historial
(RNF-11).

## Los pasos 12 y 13 van por RabbitMQ

Al cerrarse una venta se publica `ENTRADA_TRANSFERIDA` (ADR-10) y dos consumidores lo recogen:
**notificar** al comprador y al vendedor (paso 12) y **liquidar** al vendedor (paso 13).

```
                     ┌──────────────────────────────┐
  venta cerrada ───► │ reventa.eventos  (topic)      │
                     └──────┬────────────────┬──────┘
                            │ entrada.transferida    │
              ┌─────────────▼──────┐  ┌──────────────▼────────┐
              │ reventa.           │  │ reventa.              │
              │   notificaciones   │  │   liquidaciones       │
              └─────────┬──────────┘  └──────────┬────────────┘
                        │ x-dead-letter-exchange │
                     ┌──▼────────────────────────▼──┐
                     │ reventa.muertos  (topic)      │
                     │   …notificaciones.dlq         │
                     │   …liquidaciones.dlq          │
                     └───────────────────────────────┘
```

**Un `topic` y dos colas, no un envío directo.** Notificar y liquidar son dos trabajos sobre el
mismo hecho: si la liquidación se cae, las notificaciones siguen saliendo, y cada una reintenta lo
suyo. El publicador tampoco necesita saber quién le escucha — el acoplamiento que ADR-04 quería
evitar.

**Cada cola tiene su DLQ.** Es lo que ADR-10 valoró de RabbitMQ frente a Kafka: *"DLQ y reintentos
nativos, que ASR-07 y ASR-13 exigen para no perder en silencio un evento que falló"*. Se distingue
entre lo que no se puede procesar nunca (JSON roto, versión desconocida → DLQ inmediata) y lo que
falló ahora (→ hasta 3 reintentos). Reencolar siempre dejaría un mensaje roto girando en bucle.

**`persistent: true` y canal *confirm*.** Es el modo duradero que midió el PoC-05: cuesta latencia
(162 ms de mediana frente a 16 ms) y sigue treinta y cinco veces por debajo del umbral de RNF-17.
Perder una transferencia por un reinicio del broker no es negociable.

**RabbitMQ no entra en el veredicto de la sonda de vida.** Sin él no salen notificaciones, pero sí
se puede seguir vendiendo: publicar ocurre *después* de cerrar la venta. Sacar la instancia de
rotación por eso pararía las ventas por un fallo en algo que sólo manda correos.

El contrato del evento está publicado en
[`App/shared/eventos/entrada-transferida.schema.json`](../../shared/eventos/entrada-transferida.schema.json)
y hay pruebas que verifican que lo que este servicio emite valida contra él.

### Evidencia

```bash
python3 pruebas/cu006-eventos-cola.py   # con el servicio levantado
```

```
1. Una reventa publica el evento y los consumidores lo procesan
2. JSON ilegible y versión 99 -> 2 en la DLQ, 0 en la cola de trabajo
3. Un evento que falla siempre -> DLQ, no rebotando indefinidamente
4. Mismo id dos veces -> el segundo se descarta sin reprocesar
5. Con el broker DETENIDO, la venta se completa igual (HTTP 200 + QR nuevo),
   y al volver el broker los consumidores se resuscriben solos
```

El punto 5 es la razón de ser de ADR-04: se pierde la notificación, no la entrada.

Los puntos 3 y 5 se añadieron porque destaparon dos fallos que el camino feliz no mostraba: los
consumidores no se resuscribían tras una reconexión (el servicio quedaba "conectado" pero mudo), y
el contador de reintentos leía `x-death`, cabecera que RabbitMQ **solo** añade al pasar por la DLQ —
con `nack(requeue: true)` el contador nunca subía y el mensaje rebotaba para siempre, bloqueando la
cola por el `prefetch(1)`.

**Dos límites conocidos** —un evento que no se publica se pierde, y el descarte de duplicados vive
en memoria— están en [`DECISIONES.md`](DECISIONES.md) §9 con lo que haría falta para producción.

## Expiración de publicaciones (CU-006D)

Un trabajo programado (cada 10 min, `EXPIRACION_CRON`) cierra las publicaciones cuya ventana de
reventa venció y **devuelve la entrada a su dueño**.

**Por qué hace falta si el listado ya filtra por fecha.** El mercado (paso 5) ya excluye las
caducadas, así que nadie puede comprarlas. Pero en la base quedaría una publicación `ACTIVA` que no
lo está y una entrada `EN_REVENTA` que no se está revendiendo — y el índice único parcial le
impediría al vendedor volver a publicarla nunca más. Cerrar la publicación es lo que le devuelve su
entrada.

**No toca una publicación con una compra en curso.** Si alguien empezó a pagar justo antes de que se
cerrara la ventana, su bloqueo en Redis sigue vivo y esa compra merece terminar; expirarla ahí
rompería un cobro a medias. Se deja para el ciclo siguiente.

**Solo una réplica barre a la vez** (ASR-06), con un bloqueo de tarea en Redis. Y por si acaso, el
`UPDATE` lleva `WHERE estado = 'ACTIVA'`: si entre la lectura y la escritura alguien compró la
publicación, no afecta a ninguna fila y la venta no se pisa.

### Evidencia

```bash
python3 pruebas/cu006d-expiracion.py   # con el servicio levantado
```

```
1. Vencida -> EXPIRADA, entrada VALIDA, y la vendedora puede republicarla
2. Vigente -> no se toca
3. Vencida con checkout vivo -> se respeta; al cancelar, el siguiente barrido sí la cierra
4. Ejecutarlo dos veces seguidas: 0 expiradas la segunda
5. 3 publicaciones · 5 barridos simultáneos · 3 expiraciones en total
```

El punto 5 importa porque el endpoint de mantenimiento **no** toma el bloqueo de tarea —si alguien
lo fuerza a mano, quiere que se ejecute ya— y puede coincidir con el ciclo programado.

## Configuración

Todas las variables están documentadas en [`.env.example`](.env.example). La configuración se
**valida al arrancar**: un servicio mal configurado se niega a levantar en vez de fallar más tarde
en mitad de un checkout con el pago ya cobrado. Por ejemplo, un TTL de bloqueo menor que el
*timeout* de la pasarela aborta el arranque, porque dejaría caducar el bloqueo con el cobro en vuelo
y abriría la doble venta que RNF-01 prohíbe.

## Decisiones abiertas

Cuatro reglas del CU-006 no están fijadas en la documentación del proyecto (tope de precio,
comisión, plazo de expiración y TTL del bloqueo), y el modelo de datos del SAD §12 no tiene la tabla
de historial de propietarios que la post-condición 3 del CU-006 exige. El razonamiento y los valores
propuestos están en [`DECISIONES.md`](DECISIONES.md).

## Contratos publicados

```bash
npm run contrato:api    # regenera App/shared/api/entradas-mercado-secundario.openapi.json
```

| Contrato | Qué describe |
|---|---|
| [`shared/api/entradas-mercado-secundario.openapi.json`](../../shared/api/entradas-mercado-secundario.openapi.json) | Las 12 operaciones de la API REST |
| [`shared/eventos/entrada-transferida.schema.json`](../../shared/eventos/entrada-transferida.schema.json) | El evento `ENTRADA_TRANSFERIDA` |

Los dos se **generan o verifican desde el código**: un contrato mantenido a mano en paralelo se
desincroniza y acaba describiendo un servicio que ya no existe. Hay pruebas que fallan si el
contrato deja de publicar una operación del CU-006, si expone datos de tarjeta (RNF-05) o si filtra
el identificador del vendedor a los compradores.

## Pruebas

```bash
npm test                # unitarias — 165 pruebas con dobles
npm run test:cov        # cobertura — RNF-18 pide ≥ 70 % de la lógica de dominio
npm run test:integracion # las cuatro suites contra infraestructura real
npm run lint            # comprobación de tipos
```

**Cobertura actual: 77 % de sentencias**, por encima del 70 % que exige RNF-18. El umbral está
configurado en `package.json`, así que `test:cov` falla si alguien lo baja — el requisito no se
erosiona en silencio.

Qué se mide como "lógica de dominio": se excluyen el arranque, los módulos de cableado, los DTOs y
entidades (declarativos), las migraciones y semillas (scripts), el controlador (solo delega) y las
herramientas de construcción. Lo que queda es el código que decide algo.

Las **pruebas de integración** están documentadas en [`pruebas/README.md`](pruebas/README.md), con
por qué tres de los fallos encontrados no habrían salido con dobles.
