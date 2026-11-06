# Parqueaderos (Núcleo)

CU-024 (Cobro) y CU-025 (Control de ocupación). Esquema propio `parqueaderos`, undécimo de la
base única; migración `1794200000000-EsquemaParqueaderos`. Sin entidades TypeORM: SQL explícito.

La reserva (CU-021) y la lectura de su QR al entrar (CU-022/023) son de otro responsable y no
están aquí. Para que el cobro y la ocupación funcionen hay un **ingreso mínimo** (placa, zona,
`prepagada`, `reservaId` opcional): cuando CU-021–023 existan, deben llamar a estas mismas rutas
con lo que lean del QR.

| Ruta `/api/v1/parqueaderos` | Roles | Qué |
|---|---|---|
| GET / PUT `tarifa` | todos / **Administrador** | Tarifa por hora vigente e historial; definir una nueva |
| GET/POST/PATCH/DELETE `eventos/:id/zonas[/:zonaId]` | Org, Admin (GET también Personal) | Zonas con capacidad; no baja de lo ocupado ni se borra con historial |
| POST `eventos/:id/ingresos` | Org, Admin, Personal | Ingreso; sin zona va a la recomendada. **CU-025A**: zona llena → 409 `ZONA_LLENA` con alternativa |
| POST `eventos/:id/salidas` | Org, Admin, Personal | **CU-024**: salida y cobro (ver abajo) |
| GET `eventos/:id/vehiculos` | Org, Admin, Personal | Vehículos en el lote |
| GET `eventos/:id/recomendacion` | Org, Admin, Personal | Paso 7: zona que se indica a quien entra |
| GET `eventos/:id/ocupacion` (+ `/flujo` SSE cada 3 s) | Org, Admin | Pasos 2-4: % por zona, tendencia, alertas, recomendación, redirecciones |
| POST / PATCH `eventos/:id/redirecciones[/:rid]` | Org, Admin | Pasos 6-8: redirigir ingresos y anotar el resultado |

## Cobro (CU-024)

- Horas de permanencia **redondeadas hacia arriba**, mínimo una, por la tarifa vigente **al
  salir**; la estancia guarda tarifa, valor/hora, horas y monto.
- **CU-024A**: reserva prepagada → no se calcula; "El servicio ya está pagado".
- Sin tarifa vigente la salida **se registra igual** y el cobro queda pendiente (el cálculo no
  bloquea la salida).
- Repetir la salida en 10 min devuelve la misma (`repetida: true`): reintento del dispositivo.
- El pago es fuera del sistema (efectivo o datáfono): no hay pago electrónico nuevo.

## Ocupación (CU-025)

Se calcula de las estancias abiertas al leer (índices parciales por zona), sin contador aparte.
Tendencia = ingresos − salidas en 15 min. Alertas: `ZONA_CASI_LLENA` (≥ 85 %), `ZONA_LLENA`
(crítica, bloquea ingresos), `LLENADO_RAPIDO` (≤ 15 min a este ritmo), cada una con la zona a la
que conviene redirigir. Umbrales en `UMBRALES_PARQUEADERO`. Una sola redirección vigente por
evento (índice único parcial); al terminarla vuelve la recomendación automática. El panel de
monitoreo (CU-019) muestra el resumen por la interfaz local `OcupacionService.resumen`.

Un ingreso bloquea la fila de la zona (`FOR UPDATE`): dos ingresos simultáneos no ocupan el último
espacio a la vez. Una placa no puede estar dos veces dentro del mismo evento.

Pruebas: `test/parqueaderos/parqueaderos.e2e-spec.ts` (3 escenarios) y `cobro/cobro.spec.ts`.
