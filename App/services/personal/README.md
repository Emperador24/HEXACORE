> Directorio histórico, sin servidor activo. El destino del trabajo es
> `App/backend/modulos/personal-logistica`; consultar GUIA-EQUIPO-MIGRACION.md.
> Conservar este texto no acredita funcionalidad implementada.

# Personal y logística

La implementación parcial de CU-017/CU-018 que se solapa con CU-007–CU-009
vive ahora en [el módulo Personal/Logística del Núcleo](../../backend/modulos/personal-logistica/README.md).
Este directorio conserva la referencia documental del dominio; no contiene un
servidor ni otra fuente de reglas de negocio.

Núcleo atiende `/api/v1/logistica` en el mismo proceso que Identidad y Alimentos.
Sus datos viven en el esquema `personal_logistica` de la base única `hexacore`,
con sus dos migraciones originales. Las bases históricas `eventos_emergencias` y
`personal` no se usan en la arquitectura vigente.

Están disponibles empleados, zonas/asignación, turnos, cambios de turno,
asistencia y consulta de notificaciones con los límites registrados en el
README del módulo y en `Documentation/Work/ESTADO-MIGRACION.md`.
La planificación completa y las partes restantes de CU-007–CU-009 siguen
pendientes; esta etapa no implementa Operación.
