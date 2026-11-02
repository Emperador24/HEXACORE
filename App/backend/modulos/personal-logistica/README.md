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

CU-017/CU-018 comparten empleados, turnos, cambios y asistencia con CU-007–009:
se reutilizan las mismas reglas y tablas, sin crear otro sistema paralelo. Esta
cobertura no declara completos todos esos CU. La disponibilidad general actual
es global, no filtra por evento/franja; no se amplía como parte del traslado.

Instalar/arrancar/migrar desde [el workspace](../../README.md), Node 22.22.3,
Nest 11 y TypeScript 5.9. Se mantienen la base `eventos_emergencias`, las dos
migraciones originales y `synchronize=false`. Token de configuración propio;
conexión `personal-logistica` nombrada también en repositorios y cierre.

```bash
npm run migracion:logistica:estado
npm run migracion:logistica:correr
npm run start:prod
```

API y Swagger reunidos en Núcleo, puerto 3002; se retira el listener 3016.
La [integración aislada](../../test/README.md) ejecuta 59 casos originales, sus
197 aserciones y cinco casos nuevos de convivencia. No ejecuta el antiguo
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
