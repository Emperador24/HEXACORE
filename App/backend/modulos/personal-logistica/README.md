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

Las notificaciones mantienen su listado global para cualquier sesión válida,
sin filtro de destinatario (F14, deuda previa detectada). La deduplicación y los
reintentos del consumidor siguen en memoria; no se presentan como outbox o
procesamiento exactamente una vez. Se conserva cola/DLQ/prefijo, con una conexión
compartida; el cierre cancela al consumidor y espera su trabajo antes de cerrar.
