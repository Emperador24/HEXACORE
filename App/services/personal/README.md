> Directorio histórico, sin servidor activo. El destino del trabajo es
> `App/backend/modulos/personal-logistica`; consultar GUIA-EQUIPO-MIGRACION.md.
> Conservar este texto no acredita funcionalidad implementada.

# Personal y logística

La implementación parcial de CU-017/CU-018 que se solapa con CU-007–CU-009
vive ahora en [el módulo Personal/Logística del Núcleo](../../backend/modulos/personal-logistica/README.md).
Este directorio conserva la referencia documental del dominio; no contiene un
servidor ni otra fuente de reglas de negocio.

Núcleo atiende `/api/v1/logistica` en el mismo proceso que Identidad y Alimentos.
Se conserva temporalmente la base `eventos_emergencias`, sus dos migraciones y
sus datos. La base histórica `personal` no se utiliza para este traslado.

Están disponibles empleados, zonas/asignación, turnos, cambios de turno,
asistencia y consulta de notificaciones con los límites registrados en el
README del módulo y en `Documentation/Work/ESTADO-MIGRACION.md`.
La planificación completa y las partes restantes de CU-007–CU-009 siguen
pendientes; esta etapa no implementa Operación.
