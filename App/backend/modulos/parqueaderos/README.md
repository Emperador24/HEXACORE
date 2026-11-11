# Parqueaderos (Núcleo)

CU-021 (Reservar), CU-022 (Ingreso y salida), CU-023 (Asignación de espacios), CU-024 (Cobro) y
CU-025 (Control de ocupación). Esquema propio `parqueaderos`, undécimo de la base única;
migraciones `1794200000000-EsquemaParqueaderos` y `1794300000000-Cu021Cu023ReservasEspacios`.
Sin entidades TypeORM: SQL explícito.

| Carpeta | CU | Qué |
|---|---|---|
| `reservas/` | CU-021 | Disponibilidad, reserva con bloqueo temporal, pago, QR, vencimiento y confirmación |
| `accesos/` | CU-022 | Ingreso y salida por QR o placa; caché y sincronización del punto de control |
| `asignacion/` | CU-023 | Espacios por zona, reglas por tipo de vehículo, asignación bajo bloqueo, historial |
| `cobro/` | CU-024 | Tarifa, zonas y liquidación al salir |
| `ocupacion/` | CU-025 | Panel por zona, tendencia, alertas, recomendación y redirecciones |

| Ruta `/api/v1/parqueaderos` | Roles | Qué |
|---|---|---|
| GET `eventos/:id/disponibilidad` | Cliente (y personal) | **CU-021**, pasos 1-2: zonas, libres por tipo de vehículo, horas y precio |
| POST `eventos/:id/reservas` | **Cliente** | Pasos 3-4: retiene un espacio 10 min. **CU-021A** → 409 con `alternativas` |
| POST `reservas/:id/pagar` | **Cliente** | Pasos 5-9: cobra, genera el QR, suelta el bloqueo y encola la confirmación. **CU-021B** rechazo, **CU-021C** vencida |
| GET `reservas`, `reservas/:id` | **Cliente** | Sus reservas, con el QR cuando están pagadas |
| GET `eventos/:id/reservas` | Org, Admin | Las reservas del evento (sin QR) |
| GET / PUT `tarifa` | todos el personal / **Administrador** | Tarifa por hora vigente e historial; definir una nueva |
| GET/POST/PATCH/DELETE `eventos/:id/zonas[/:zonaId]` | Org, Admin (GET también Personal) | Zonas; crear una crea sus espacios; la capacidad no baja de lo ocupado o reservado |
| GET `eventos/:id/espacios` · PATCH `…/espacios/:espacioId` | Personal · Org, Admin | **CU-023**: mapa de espacios con estado; cambiar tipo, prioridad o retirarlo |
| GET `eventos/:id/asignaciones` | Org, Admin | CU-023, paso 8: historial de asignaciones y liberaciones |
| POST `eventos/:id/ingresos` | Org, Admin, Personal | **CU-022**: por `codigoQr` o `placa`; el sistema asigna el espacio |
| POST `eventos/:id/salidas` | Org, Admin, Personal | CU-022, pasos 5-9 + **CU-024**: salida, permanencia, espacio liberado y cobro |
| GET `eventos/:id/cache` · POST `…/sincronizacion` | Org, Admin, Personal | CU-022 offline-first: caché del punto de control y registros hechos sin red |
| GET `eventos/:id/vehiculos` | Org, Admin, Personal | Vehículos en el lote |
| GET `eventos/:id/recomendacion` | Org, Admin, Personal | CU-025, paso 7: zona que se indica a quien entra |
| GET `eventos/:id/ocupacion` (+ `/flujo` SSE cada 3 s) | Org, Admin | CU-025, pasos 2-4 |
| POST / PATCH `eventos/:id/redirecciones[/:rid]` | Org, Admin | CU-025, pasos 6-8 |

El gateway deja pasar al rol Cliente a `/parqueaderos/`; el Núcleo acota cada ruta por rol.

## Reserva (CU-021)

- **Precio**: horas desde la llegada prevista (sin ella, el inicio del evento) hasta el final,
  redondeadas hacia arriba, por la tarifa vigente. El cliente nunca manda el precio ni el espacio.
- **Bloqueo temporal** (paso 4): la reserva nace `PENDIENTE_PAGO` con su espacio y vence a los
  10 min. Redis guarda el bloqueo con su vencimiento (`parqueaderos:bloqueo:<espacio>`, `PX`);
  **la garantía es PostgreSQL**: la zona se bloquea al reservar y dos índices únicos parciales
  impiden reservar dos veces el mismo espacio o la misma placa. Sin Redis, sigue funcionando.
- **Pago**: Finanzas/Pagos con clave `parqueadero-<reserva>-<rechazos>`, como la compra de
  entradas: un rechazo (CU-021B) deja la reserva viva y cambia la clave; una respuesta incierta
  deja la reserva `PAGANDO` (fuera del barrido) y reintentar usa la misma clave, sin cobrar dos veces.
- **QR** (paso 7): `HXP-` + 16 caracteres aleatorios, solo visible para su dueño cuando está pagada.
- **Vencimiento** (CU-021C): un barrido cada 15 s (y antes de cada reserva o consulta) pasa a
  `EXPIRADA` lo no pagado a tiempo y libera el espacio; pagar tarde responde `CU-021C`.
- **Confirmación** (paso 9): `notificaciones_reserva` es la bandeja de salida, escrita en la misma
  transacción que confirma; se publica en la cola `parqueaderos.reservas` (con DLQ) y el
  consumidor deja el correo con el QR en el registro, como el de la venta de entradas.

## Ingreso y salida (CU-022)

- Con QR: debe ser de una reserva **pagada** de **este** evento (si no, 422 `QR_INVALIDO`,
  CU-022B); usada → 409 `RESERVA_YA_USADA`; la placa, si se indica, debe coincidir. El vehículo va
  a su espacio y queda prepagado (CU-024A). Con placa y reserva pagada, igual.
- Sin reserva (CU-022A): entra si hay espacio; CU-023 lo asigna. Lleno → `PARQUEADERO_LLENO`
  (CU-022C) o `ZONA_LLENA` con alternativa.
- La salida acepta QR o placa, registra la hora, la permanencia, libera el espacio y cobra.
- **Offline-first**: `cache` da el SHA-256 de cada QR vigente (nunca el código), las placas
  dentro y los cupos por zona. El dispositivo decide con eso sin red y guarda cada registro con
  su id y la hora real; `sincronizacion` los aplica en orden cronológico, cada uno responde por
  sí solo (`APLICADO`, `REPETIDO`, `RECHAZADO`) y reenviar el mismo id no duplica nada. Se
  rechazan horas con más de 48 h de atraso o 5 min de adelanto.

## Asignación de espacios (CU-023)

- Cada zona tiene espacios numerados (`<prefijo>-01`…); su capacidad es cuántos están activos.
  Subirla numera nuevos (o reactiva retirados); bajarla retira los libres de número más alto.
- Tipos: automóvil, moto, movilidad reducida. Un automóvil solo usa espacios de automóvil; una
  moto o un vehículo de movilidad reducida prefieren el suyo y, si no hay, uno de automóvil.
  Dentro del tipo, menor `prioridad` (cercanía a la entrada) primero.
- La asignación ocurre con la zona bloqueada (`FOR UPDATE`): dos solicitudes simultáneas nunca
  eligen el mismo espacio. Sin zona, se bloquean todas las del evento en orden fijo (sin
  interbloqueos) y se prueba primero la recomendada por CU-025.
- CU-023A: sin espacio en la zona pedida, 409 con una alternativa que sí lo tenga. CU-023B: si el
  operador pide un espacio ya tomado, se asigna otro (`reasignado: true`, origen `REASIGNACION`).
- Cada asignación y liberación queda en `asignaciones_espacio` (paso 8).

## Cobro (CU-024)

- Horas de permanencia **redondeadas hacia arriba**, mínimo una, por la tarifa vigente **al
  salir**; la estancia guarda tarifa, valor/hora, horas y monto.
- **CU-024A**: con reserva pagada no se calcula; "El servicio ya está pagado". Lo determina la
  reserva, nunca quien registra el ingreso.
- Sin tarifa vigente la salida **se registra igual** y el cobro queda pendiente.
- Repetir la salida en 10 min devuelve la misma (`repetida: true`): reintento del dispositivo.
- El pago a la salida es fuera del sistema (efectivo o datáfono).

## Ocupación (CU-025)

Se calcula de las estancias abiertas y las reservas vigentes al leer, sin contador aparte. Un
espacio reservado no está ocupado pero tampoco disponible: cuenta para el porcentaje y para llenar
la zona (`reservados`). Tendencia = ingresos − salidas en 15 min. Alertas: `ZONA_CASI_LLENA`
(≥ 85 %), `ZONA_LLENA` (crítica, bloquea ingresos), `LLENADO_RAPIDO` (≤ 15 min a este ritmo), cada
una con la zona a la que conviene redirigir. Una sola redirección vigente por evento. El panel de
monitoreo (CU-019) muestra el resumen por la interfaz local `OcupacionService.resumen`.

## Clientes

- Portal cliente `parqueadero/`: disponibilidad, reserva, pasarela y "Mis reservas" con QR.
- App móvil: `pages/parking_page.dart` (cliente) y `ParkingOperationsPage` (personal: escanear QR,
  tipo de vehículo, espacio asignado, modo sin red con `services/punto_control_local.dart`).
- Portal admin `parqueaderos/`: ingreso por QR o placa, mapa de espacios, reservas e historial.

Pruebas: `test/parqueaderos/parqueaderos.e2e-spec.ts` (8 escenarios, con PostgreSQL, Redis,
RabbitMQ y pasarela reales), `cobro/cobro.spec.ts`, `asignacion/asignacion.spec.ts`, y en la app
`test/punto_control_local_test.dart`.
