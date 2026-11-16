# Personal/Logística dentro de Núcleo

Implementación única trasladada de `App/services/eventos-emergencias`.
Se conserva lo existente; no implementa monitoreo, incidentes, evacuaciones,
planificación logística completa ni proveedores.

| Código y rutas /api/v1/logistica | Alcance conservado |
|---|---|
| POST/GET empleados, GET empleados/yo | Alta/listado y ficha activa del usuario |
| POST/GET zonas, GET personal-disponible | Zonas, cobertura/déficit y candidatos por rol |
| POST zonas/:zonaId/asignaciones, PATCH turnos/:turnoId/reasignar | Asignación/reasignación; rol, solapamiento, 12 h por turno y 14 h por día |
| POST/GET turnos | Creación y consulta de turnos, propia o supervisada |
| POST turnos/:turnoId/solicitudes-cambio, GET solicitudes-cambio | Solicitud propia/supervisada, búsqueda de reemplazo y filtrado por estado |
| PATCH solicitudes-cambio/:solicitudId/revisar | Aprobación/rechazo/bloqueo por horas, supervisor tomado de sesión |
| POST asistencia/entrada, POST asistencia/salida, GET asistencia | Credencial activa, turno/evento, anomalías, cálculo e idempotencia de sincronización |
| GET notificaciones | Evidencia persistida de mensajes de asignación/cambio recibidos por RabbitMQ |
| GET/PATCH empleados/:id, POST empleados/:id/desactivar y /reactivar | CU-007: ficha con documento/correo/teléfono únicos, edición auditada, baja que cancela turnos futuros |
| GET zonas/:zonaId/candidatos, GET asignaciones | CU-007 paso 7: activos del rol con disponibilidad y motivo; asignaciones de un evento |
| GET solicitudes-cambio/:id/reemplazos y /historial, POST /cancelar y /respuesta-reemplazo | CU-008: reemplazos posibles, historial, CU-008B y CU-008C |
| GET asistencia/reporte, GET asistencia/estado | CU-009: reporte de horas y puntualidad; «En turno»/«Fuera de turno» |
| POST turnos/:turnoId/cancelar, POST turnos/:turnoId/respuesta | CU-007C (cancelar con motivo) y paso 13/CU-007B (el propio empleado confirma o rechaza) |

## CU-007 · Gestión de personal para eventos

Se apoya en las reglas de asignación de CU-017 (rol, choque de horario, 12 h por
turno y 14 h por día) y añade lo que faltaba alrededor:

- **Ficha completa.** `documento`, `correo` (en minúsculas) y `telefono`, con
  UNIQUE en documento y correo. Son opcionales en la API para no romper las altas
  anteriores; el portal los exige. Un duplicado responde 409 con `campo`.
- **Edición y baja.** Cambiar el rol se rechaza si tiene asignaciones vigentes de
  zonas. Desactivar exige motivo, cancela sus turnos futuros y cierra las
  solicitudes de cambio pendientes sobre ellos; no toca su cuenta (CU-027B).
  Asignar a un empleado inactivo devuelve 400.
- **Respuesta del empleado.** `turnos.confirmacion` (PENDIENTE, CONFIRMADA,
  RECHAZADA) va aparte de `estado` (ciclo de CU-018). Rechazar exige motivo, deja
  el turno CANCELADO y libera el puesto. Reasignar vuelve a PENDIENTE y reabre un
  turno rechazado. Solo responde el empleado dueño del turno, según su sesión.
- **Auditoría.** Tabla `auditoria_personal`, escrita en la misma transacción que
  la operación. El servicio solo inserta; ningún disparador impide editarla desde SQL.
- **Avisos.** Asignar, cancelar y rechazar publican en `turnos.cambios`
  (PERSONAL_ASIGNADO, ASIGNACION_CANCELADA, ASIGNACION_RECHAZADA). Siguen sin
  destinatario ni correo (F14); el consumidor solo los persiste.

Migración `1793664000000-Cu007GestionPersonal`, aditiva: los turnos existentes
quedan CONFIRMADA. Es la primera posterior a la consolidación, así que figura en
`GRUPOS_MIGRACIONES` y no en `PROCEDENCIA_ORIGINAL`.

Límites conocidos: dos asignaciones simultáneas del mismo empleado pueden pasar
ambas la comprobación de choque (no hay restricción de exclusión en la base;
deuda previa de CU-017). El `eventoId` no se valida contra Catálogo porque el
Núcleo no lee la base de Boletería (ADR-16); el portal solo ofrece eventos de la
cartelera.

## CU-008 · Gestionar cambios de turno

Sobre la solicitud de CU-018 (migración `1794000000000-Cu008Cu009CambiosAsistencia`, aditiva):

- **Paso 4:** solicitar avisa al supervisor (`CAMBIO_SOLICITADO` por `turnos.cambios`).
- **Pasos 6-8:** `GET …/reemplazos` lista los del mismo rol con su disponibilidad (sin choque con
  ningún turno no cancelado y sin pasar 14 h ese día). El supervisor aprueba con `reemplazoId`
  (o el propuesto) y se **vuelve a comprobar** al aprobar: un ocupado responde 409.
- **Pasos 10-12:** el turno pasa al reemplazo con `confirmacion` PENDIENTE; se avisa al original
  (`CAMBIO_APROBADO`) y al reemplazo (`TURNO_CAMBIADO`).
- **CU-008A:** rechazar acepta motivo y se le avisa al empleado.
- **CU-008B:** `POST …/cancelar` por quien la pidió (o un supervisor) mientras está pendiente.
- **CU-008C:** el reemplazo confirma o rechaza (con motivo) desde su sesión. Si rechaza, el turno
  vuelve al titular y la solicitud regresa a PENDIENTE con otro reemplazo propuesto, sin repetir a
  quien dijo que no (`reemplazosDescartados`); sin nadie más queda SIN_REEMPLAZO.
- **Paso 13:** cada paso queda en `auditoria_personal` (`detalle.solicitudId`), en la misma
  transacción; `GET …/historial` lo devuelve en orden.
- Un empleado ve las solicitudes que pidió y las **aprobadas** en que lo nombraron reemplazo.

## CU-009 · Registrar ingreso y salida del personal

- **CU-009A/B:** la entrada se acepta desde 60 min antes del inicio y queda `ANTICIPADA`,
  `A_TIEMPO` (±10 min) o `TARDIA`, con `minutosDesviacion`. Llegar antes o tarde no es anomalía.
- **CU-009C:** la salida (hasta 4 h después del fin) queda `ANTICIPADA`, `A_TIEMPO` o `POSTERIOR`.
- Los turnos cancelados ya no cuentan como vigentes; las entradas marcadas como anomalía no abren
  turno. Cada registro devuelve `estadoEmpleado` (`EN_TURNO` / `FUERA_DE_TURNO`).
- **Pasos 12-13:** `GET asistencia/reporte?eventoId=` (o `desde`/`hasta`), solo para quien
  supervisa: turnos, horas programadas y trabajadas, tardías, anticipadas, salidas fuera de
  horario, anomalías y estado actual por empleado.
- Ventanas en `turnos-asistencia.constants.ts`. El offline-first (hora del cliente e
  `idempotencyKey`) se conserva.

`test/logistica/cambios-asistencia.e2e-spec.ts`: 7 escenarios.

CU-017/CU-018 comparten empleados, turnos, cambios y asistencia con CU-007–009:
se reutilizan las mismas reglas y tablas, sin crear otro sistema paralelo. Esta
cobertura no declara completos todos esos CU. La disponibilidad general actual
es global, no filtra por evento/franja; no se amplía como parte del traslado.

Instalar/arrancar/migrar desde [el workspace](../../README.md), Node 22.22.3,
Nest 11 y TypeScript 5.9. La conexión usa POSTGRES_BD común, esquema
`personal_logistica`, las dos migraciones originales y `synchronize=false`.
DB_NAME/DB_HOST/PORT/USER/PASSWORD se rechazan; no seleccionan otro destino. Token de configuración propio;
conexión `personal-logistica` nombrada también en repositorios y cierre.

```bash
npm run migracion:logistica:estado
npm run datos:preparar # tarea única para los ocho historiales antes de apps
npm run start:prod
```

API y Swagger reunidos en Núcleo, puerto 3002; se retira el listener 3016.
La [integración aislada](../../test/README.md) ejecuta 59 casos originales, sus
197 aserciones, cinco casos nuevos de convivencia y 11 de CU-007
(`test/logistica/gestion-personal.e2e-spec.ts`). No ejecuta el antiguo
prehook que truncaba. Los scripts seed/carga se preservan como comandos explícitos
semilla:logistica/carga:logistica, fuera de las pruebas; no se ejecutaron aquí.

Se conserva la autorización: ficha activa con rol `Jefe de personal` supervisa,
aunque el rol de cuenta sea solo Personal. Organizador/Administrador mantienen
la supervisión existente. Un empleado consulta sus turnos/solicitudes/fichajes y
no puede pedir cambios ajenos ni aprobarlos. La asistencia desde un punto de
control se decide por credencial escaneada, como antes. La revocación se consulta
en el Redis común de Identidad.

La revisión de Seguridad por recurso corrigió el listado de notificaciones:
quien supervisa conserva la consulta global; cada ficha activa ve solo las
notificaciones cuyo empleadoId le corresponde; sin ficha, lista vacía. Se
reutiliza ContextoDeLogistica, sin nueva ACL o mecanismo de entrega F14.
Los puntos de control de asistencia exigen rol Personal/Organizador/Administrador:
una cuenta Cliente no puede escribir fichajes aunque conozca una credencial.
La credencial sigue identificando al empleado escaneado, no al operador.
La deduplicación y los
reintentos del consumidor siguen en memoria; no se presentan como outbox o
procesamiento exactamente una vez. Se conserva cola/DLQ/prefijo, con una conexión
compartida; el cierre cancela al consumidor y espera su trabajo antes de cerrar.
