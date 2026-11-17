# Revisión de Daniel: Parqueaderos (CU-021 a 023) e integración de CU-026 en Entradas

La [guía del equipo](GUIA-EQUIPO-MIGRACION.md) deja dos implementaciones para revisión de
Daniel Cristancho:

- **CU-021, 022 y 023**, implementados por Samuel en `App/backend/modulos/parqueaderos`
  (commits `f2db59e` y siguientes) para poder cerrar CU-024 y 025.
- **El consumo de `eventos.gestion` (CU-026) en Catálogo, Ventas, Postventa y Acceso QR**,
  implementado por Samuel el 9 nov.

Revisión de código sobre `main` en `4cffea3` (16 nov 2026). No se modificó el código
revisado: los hallazgos quedan para decidir con el equipo. La implementación sigue
siendo de Samuel; la responsabilidad funcional de CU-021 a 023 es de Daniel.

Severidad: **media** = puede dejar dinero o recursos en un estado incorrecto sin que
nadie lo note; **baja** = borde poco probable o precisión de documentación.

---

## Parqueaderos (CU-021, 022, 023)

### Lo que está bien resuelto

- **Exclusión de espacios**: la asignación bloquea la zona (`SELECT … FOR UPDATE`) y
  dos índices únicos parciales impiden un espacio con dos reservas vigentes o una placa
  con dos reservas. Cuando se bloquean todas las zonas, se hace en orden por `id`, lo que
  evita interbloqueos (`asignacion.service.ts:110`).
- **Pago idempotente**: la clave `parqueadero-<reserva>-<intentosRechazados>` solo cambia
  tras un rechazo; reintentar tras una respuesta incierta no cobra dos veces
  (`reservas.service.ts:231`).
- **Modo sin red (CU-022)**: la caché lleva solo el hash del QR, no el código
  (`accesos.service.ts:241`); la sincronización es idempotente por id local y rechaza un id
  que pertenezca a otro evento (`accesos.service.ts:286-293`); acota la hora del
  dispositivo (48 h atrás, 5 min adelante).
- **Roles**: reservar y pagar solo Cliente; ingresos, salidas y caché solo Personal,
  Organizador o Administrador; cada cliente ve solo sus reservas (`r.cliente_id = $2`).

### Hallazgos

**P1 — media. Un pago indeterminado retiene el espacio sin límite.**
`reservas.service.ts:199-208`. Si la pasarela no confirma (`INDETERMINADO`), la reserva
queda en `PAGANDO`. Ese estado cuenta como reserva activa (`RESERVA_ACTIVA` en
`asignacion.service.ts:10`) y el barrido de vencidas solo mira `PENDIENTE_PAGO`. Si el
cliente no vuelve a pagar, el espacio queda retenido para siempre y nadie concilia el
cobro. Es la misma clase de problema que F12 en Entradas.
*Propuesta*: un barrido que reintente con la misma clave las reservas `PAGANDO`
antiguas y, si sigue sin respuesta, las marque para conciliación.

**P2 — baja. El "bloqueo en Redis" solo se escribe.**
`reservas.service.ts:161` y `:223`. La clave `parqueaderos:bloqueo:<espacio>` se crea y se
borra, pero ninguna consulta la lee: la exclusión real es la de PostgreSQL. No es un
error (el código lo dice: *"Redis es una ayuda, no la garantía"*), pero la guía del
equipo y la presentación dicen "reserva con bloqueo en Redis".
*Propuesta*: describirlo como "retención en PostgreSQL, con marca en Redis".

**P3 — baja. `GET …/disponibilidad?llegada=` no valida la fecha.**
`reservas.controller.ts:22` recibe `llegada` como texto, sin DTO. Con un valor que no es
fecha, `new Date()` da `Invalid Date`; las comparaciones con `NaN` son falsas, así que la
validación de `llegada()` (`reservas.service.ts:314`) no lo rechaza y la respuesta sale
200 con horas y precio inválidos (`null` en JSON). Reservar sí valida (`@IsDateString`).
*Propuesta*: validar `llegada` con el mismo decorador en la consulta.

**P4 — baja. Un ingreso sin reserva puede dejar una reserva pendiente inservible.**
`accesos.service.ts:105-108`. Por placa solo se busca una reserva `CONFIRMADA`. Si el
vehículo tiene una `PENDIENTE_PAGO` y entra por la barrera, entra sin reserva a otro
espacio. Si después el cliente paga, la reserva queda `CONFIRMADA` pero no se puede usar
(`VEHICULO_EN_LOTE`) y su espacio sigue retenido hasta el final del evento.
*Propuesta*: al ingresar sin reserva, avisar al operador de la reserva pendiente, o
liberarla.

**P5 — informativo. Ingreso por placa sin QR.**
Por placa se usa la reserva `CONFIRMADA` sin presentar el QR. El CU lo permite ("QR o la
placa"), pero conviene dejarlo explícito para Seguridad: quien conozca la placa entra al
espacio reservado.

---

## Integración de CU-026 en Boletería

### Lo que está bien resuelto

- Una cola durable con DLQ por módulo; un módulo caído no frena a los demás.
- Se descarta la versión `≤` aplicada, así que un mensaje repetido o desordenado no pisa la
  copia (`consumidor-eventos-gestion.ts:96-109`).
- La forma del mensaje se valida antes de tocar la base; lo ilegible va directo a la DLQ.
- El upsert de localidades no toca `vendidas` ni `reservadas`.
- Ventas aplica la cancelación en el orden correcto: primero la copia queda `CANCELADO`
  (cierra la venta) y después devuelve compra por compra; una nueva entrega retoma lo que
  faltó.

### Hallazgos

**E1 — media. Los reintentos son inmediatos y el contador vive en memoria.**
`consumidor-eventos-gestion.ts:72-86`. Un fallo hace `nack(requeue=true)`, que RabbitMQ
reentrega al instante. Tres fallos seguidos ocurren en milisegundos, así que un corte
breve de PostgreSQL o de la pasarela manda el mensaje a la DLQ, y nada lo reprocesa
desde ahí. Además el contador `intentos` es un `Map` por proceso: con dos réplicas de
Boletería el límite real es 3 × réplicas, y se pierde al reiniciar.
*Propuesta*: reintento con espera (cola de reintento con TTL, o cabecera
`x-death`) y un procedimiento documentado para reprocesar la DLQ.

**E2 — media. En la devolución masiva, un reembolso fallido no se reintenta.**
`cancelacion.service.ts:110-142` y `:204-229`. Cuando el evento se cancela, cada compra se
reembolsa. Si la pasarela **rechaza**, las entradas vuelven a `VALIDA` (de un evento
cancelado), la compra sigue `PAGADA` y la cancelación queda `RECHAZADA`. Si es
**indeterminado**, queda `FALLIDA` con las entradas anuladas. En los dos casos el mensaje
se confirma (`ack`) y solo queda un log. Una nueva entrega tampoco lo arreglaría: en el
indeterminado las entradas ya están anuladas y la cotización no encuentra nada que
cancelar. El cliente puede quedarse sin su dinero sin que nadie lo vea.
*Propuesta*: listar las cancelaciones `RECHAZADA`/`FALLIDA` por evento cancelado y
reintentarlas o escalarlas; mismo frente que F12.

**E3 — baja. Postventa retira la publicación antes de devolver la entrada.**
`postventa/eventos/consumidor-eventos.service.ts`, `retirarPublicaciones`. La publicación
pasa a `RETIRADA` y después se llama a `devolverDeReventa`. Si esa llamada falla, el
reintento ya no encuentra la publicación `ACTIVA` y la entrada queda `EN_REVENTA`. Está
mitigado: al cancelar el evento, Ventas anula también las `EN_REVENTA`
(`cancelacion.service.ts:164-166`), así que el dueño recibe su reembolso. Solo queda el
estado inconsistente cuando la cancelación no pide devolución.

---

## Resumen

| Id | Dónde | Severidad | Acción sugerida |
|---|---|---|---|
| P1 | Parqueaderos, pago | media | Barrido de `PAGANDO` y conciliación |
| P2 | Parqueaderos, documentación | baja | Precisar "bloqueo en Redis" |
| P3 | Parqueaderos, disponibilidad | baja | Validar `llegada` |
| P4 | Parqueaderos, ingreso | baja | Avisar o liberar la reserva pendiente |
| P5 | Parqueaderos, ingreso | info | Dejarlo explícito para Seguridad |
| E1 | Consumidores CU-026 | media | Reintento con espera y reproceso de la DLQ |
| E2 | Ventas, devolución masiva | media | Reintentar o escalar reembolsos fallidos |
| E3 | Postventa | baja | Invertir el orden o reintentar la devolución |

Ninguno impide la demostración. P1, E1 y E2 conviene mencionarlos como límites conocidos
junto a F12.
