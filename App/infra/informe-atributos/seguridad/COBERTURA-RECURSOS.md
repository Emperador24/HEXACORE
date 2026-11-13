# Cobertura por recurso — 13/11/2026, cierre de Alimentos

**69/159 operaciones protegidas** con ampliación semántica por gateway y backend
directo; **90 pendientes**. Alimentos pasa de **10/30 a 30/30**: se agregan las
20 pendientes y se reejecutan las otras diez. Las **39** cubiertas fuera de
Alimentos se reutilizan de la entrega anterior, con sus fuentes relevantes sin
cambios desde `7130d52`; no son ejecuciones nuevas de este bloque.

El inventario actual sigue en **178 operaciones declaradas / 173 expuestas /
159 protegidas**. Las 30 de Alimentos coinciden por método/ruta con los
controladores compilados y con esta tabla: sin altas/bajas ni diferencias en el
denominador. HEAD implícito no duplica GET. Las 41 originalmente sin metadato de
rol mantienen su evidencia previa; actualmente hay 39 sin ese metadato.

Tres finales nuevas, **278/278 por final**: 274 observaciones de autorización/
contrato, dos de validación de identidad extra y dos de relación producto-pedido
separadas. **142 rechazos** por final tienen capturas SQL/Redis iguales antes y
después; incluyen esas cuatro observaciones separadas. Los 400 no se usan como
prueba de autorización. Cada canal tiene controles positivos de **30/30** rutas;
los 404 usan recursos existentes con acceso propio 200, y las mutaciones se
prueban antes de completarlas. Administración es global por contrato, catálogos
son compartidos y no se inventa una frontera organización-evento.

[Caso/contrato y reproducción](AUTORIZACION-ALIMENTOS.md) ·
[Evidencia nueva saneada](ALIMENTOS-RECURSOS-EVIDENCIA.json).
Las 90 pendientes conservan la evidencia previa de identidad/rol. Cubrir una
operación no agota todas sus combinaciones, carreras o estados. RNF-05/06 siguen
parciales; DAST no se amplía. [Historia 49/159](RECURSOS-DAST-EVIDENCIA.json):
302 + 30 observaciones por final, cuatro 404 de ficha ausente separados, sin
sobrescribir sus fallos o resultados. La columna distingue ampliación/reejecución
de Alimentos y cobertura previa de las demás rutas.

| Método | Ruta | Regla efectiva revisada | Prueba por gateway/directo | Ubicación |
|---|---|---|---|---|
|POST|`/api/v1/cola/eventos/:eventoId/turnos`|SesionValida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/entradas/fila/cola/cola.controller.ts`|
|GET|`/api/v1/cola/eventos/:eventoId`|SesionValida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/entradas/fila/cola/cola.controller.ts`|
|POST|`/api/v1/compras/:id/cancelacion/cotizacion`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|POST|`/api/v1/compras/:id/cancelaciones`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|DELETE|`/api/v1/compras/:id/cupon`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|PUT|`/api/v1/compras/:id/cupon`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|POST|`/api/v1/compras/:id/pagar`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|GET|`/api/v1/compras/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|GET|`/api/v1/compras`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|POST|`/api/v1/compras`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|GET|`/api/v1/ingresos/eventos/:eventoId/cache`|SesionValida; Personal, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/ingresos/sincronizacion`|SesionValida; Personal, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/ingresos`|SesionValida; Personal, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/reventa/checkout/:id/pagar`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|DELETE|`/api/v1/reventa/checkout/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/checkout/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/reventa/mantenimiento/expirar-publicaciones`|SesionValida; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/mis-entradas`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/reventa/publicaciones/:id/checkout`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|DELETE|`/api/v1/reventa/publicaciones/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/publicaciones/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|PATCH|`/api/v1/reventa/publicaciones/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/publicaciones`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/reventa/publicaciones`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/admin/cuentas/:id/activar`|SesionRequerida, AdministradorRequerido; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|POST|`/api/v1/admin/cuentas/:id/desactivar`|SesionRequerida, AdministradorRequerido; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|DELETE|`/api/v1/admin/cuentas/:id`|SesionRequerida, AdministradorRequerido; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|GET|`/api/v1/admin/cuentas/:id`|SesionRequerida, AdministradorRequerido; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|GET|`/api/v1/admin/cuentas`|SesionRequerida, AdministradorRequerido; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|PUT|`/api/v1/cuentas/perfil/contrasena`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/cuentas/perfil.controller.ts`|
|GET|`/api/v1/cuentas/perfil`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/cuentas/perfil.controller.ts`|
|PATCH|`/api/v1/cuentas/perfil`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/cuentas/perfil.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/confirmar`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/descartar`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/finalizar`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/evacuaciones/:id/flujo`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/nivel`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/evacuaciones/:id/reporte`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/salidas/:salidaId/bloqueo`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/zonas/:zonaId/ruta`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|PATCH|`/api/v1/emergencias/evacuaciones/:id/zonas/:zonaId`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/evacuaciones/:id`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/eventos/:eventoId/activa`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/eventos/:eventoId/evacuaciones`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/eventos/:eventoId/evacuaciones`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/eventos`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/recintos/:recintoId/plan`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|PUT|`/api/v1/emergencias/recintos/:recintoId/plan`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/eventos/:id/cancelar`|SesionValida; Organizador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|POST|`/api/v1/eventos/:id/publicar`|SesionValida; Organizador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|DELETE|`/api/v1/eventos/:id`|SesionValida; Organizador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/eventos/:id`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|PUT|`/api/v1/eventos/:id`|SesionValida; Organizador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/eventos/disponibilidad`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/eventos`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|POST|`/api/v1/eventos`|SesionValida; Organizador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/logistica/asignaciones`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|POST|`/api/v1/logistica/asistencia/entrada`|SesionValida, ContextoDeLogistica; Personal, Organizador, Administrador|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/asistencia.controller.ts`|
|GET|`/api/v1/logistica/asistencia/estado`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/asistencia.controller.ts`|
|GET|`/api/v1/logistica/asistencia/reporte`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/asistencia.controller.ts`|
|POST|`/api/v1/logistica/asistencia/salida`|SesionValida, ContextoDeLogistica; Personal, Organizador, Administrador|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/asistencia.controller.ts`|
|GET|`/api/v1/logistica/asistencia`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/asistencia.controller.ts`|
|POST|`/api/v1/logistica/empleados/:id/desactivar`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|POST|`/api/v1/logistica/empleados/:id/reactivar`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|GET|`/api/v1/logistica/empleados/:id`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|PATCH|`/api/v1/logistica/empleados/:id`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|GET|`/api/v1/logistica/empleados/yo`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|GET|`/api/v1/logistica/empleados`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|POST|`/api/v1/logistica/empleados`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|GET|`/api/v1/logistica/notificaciones`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/notificaciones.controller.ts`|
|GET|`/api/v1/logistica/personal-disponible`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/personal-operativo.controller.ts`|
|POST|`/api/v1/logistica/solicitudes-cambio/:solicitudId/cancelar`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|GET|`/api/v1/logistica/solicitudes-cambio/:solicitudId/historial`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|GET|`/api/v1/logistica/solicitudes-cambio/:solicitudId/reemplazos`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|POST|`/api/v1/logistica/solicitudes-cambio/:solicitudId/respuesta-reemplazo`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|PATCH|`/api/v1/logistica/solicitudes-cambio/:solicitudId/revisar`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|GET|`/api/v1/logistica/solicitudes-cambio`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|POST|`/api/v1/logistica/turnos/:turnoId/cancelar`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|PATCH|`/api/v1/logistica/turnos/:turnoId/reasignar`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/personal-operativo.controller.ts`|
|POST|`/api/v1/logistica/turnos/:turnoId/respuesta`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|POST|`/api/v1/logistica/turnos/:turnoId/solicitudes-cambio`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|GET|`/api/v1/logistica/turnos`|SesionValida, ContextoDeLogistica; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|POST|`/api/v1/logistica/turnos`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/turnos.controller.ts`|
|POST|`/api/v1/logistica/zonas/:zonaId/asignaciones`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/personal-operativo.controller.ts`|
|GET|`/api/v1/logistica/zonas/:zonaId/candidatos`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/gestion-personal.controller.ts`|
|GET|`/api/v1/logistica/zonas`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/personal-operativo.controller.ts`|
|POST|`/api/v1/logistica/zonas`|SesionValida, ContextoDeLogistica, SoloQuienSupervisa; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/personal-logistica/turnos-asistencia/personal-operativo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos/:id/alertas`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|PATCH|`/api/v1/monitoreo/eventos/:id/decisiones/:decisionId`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|POST|`/api/v1/monitoreo/eventos/:id/decisiones`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos/:id/flujo`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos/:id/panel`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/asignaciones`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/cache`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/disponibilidad`|SesionValida; Cliente, Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/espacios/:espacioId`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/espacios`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/ingresos`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion/flujo`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/recomendacion`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones/:redireccionId`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/salidas`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/sincronizacion`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/vehiculos`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|DELETE|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/reservas/:id/pagar`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/reservas/:id`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/reservas`|SesionValida; Cliente|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/tarifa`|SesionValida; Organizador, Administrador, Personal|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PUT|`/api/v1/parqueaderos/tarifa`|SesionValida; Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/pedidos/:pedidoId/pagos`|SesionValida; Cliente|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/pagos/pagos.controller.ts`|
|PATCH|`/api/v1/pedidos/admin/establecimientos/:id/estado`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|DELETE|`/api/v1/pedidos/admin/establecimientos/:id/personal/:usuarioId`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|PUT|`/api/v1/pedidos/admin/establecimientos/:id/personal/:usuarioId`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|GET|`/api/v1/pedidos/admin/establecimientos/:id/personal`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|GET|`/api/v1/pedidos/admin/establecimientos/:id`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|PUT|`/api/v1/pedidos/admin/establecimientos/:id`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|GET|`/api/v1/pedidos/admin/establecimientos/cuentas-personal`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|GET|`/api/v1/pedidos/admin/establecimientos`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|POST|`/api/v1/pedidos/admin/establecimientos`|SesionValida; Organizador, Administrador|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|POST|`/api/v1/pedidos/checkout`|SesionValida; Cliente|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/checkout/checkout.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/ajustes`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/entregas/confirmar`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/recepcion/entrega.controller.ts`|
|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/entregas/prevalidar`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/recepcion/entrega.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/menu`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/operaciones/:operacionId`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/cancelacion`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/recepcion/cancelacion.controller.ts`|
|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/cancelacion`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/recepcion/cancelacion.controller.ts`|
|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/preparacion`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/recepcion/recepcion.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/recepcion/recepcion.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/recepcion/recepcion.controller.ts`|
|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/productos/:productoId/ajustes`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|PATCH|`/api/v1/pedidos/establecimientos/:establecimientoId/productos/:productoId`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|PUT|`/api/v1/pedidos/establecimientos/:establecimientoId/productos/:productoId`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/productos`|SesionValida; identidad/contexto del servicio|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/catalogo/catalogo.controller.ts`|
|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/productos`|SesionValida, PersonalDelEstablecimiento; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/menu/menu.controller.ts`|
|GET|`/api/v1/pedidos/eventos/:eventoId/establecimientos`|SesionValida; identidad/contexto del servicio|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/catalogo/catalogo.controller.ts`|
|GET|`/api/v1/pedidos/mis-establecimientos`|SesionValida; Personal|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/establecimientos/establecimientos.controller.ts`|
|GET|`/api/v1/pedidos/mis-pedidos/:pedidoId`|SesionValida; Cliente|Sí; Alimentos 3×278, ambas vías; reejecutada|`App/backend/modulos/alimentos/recepcion/recepcion.controller.ts`|
|GET|`/api/v1/pedidos/mis-pedidos`|SesionValida; Cliente|Sí; Alimentos 3×278, ambas vías; ampliada|`App/backend/modulos/alimentos/recepcion/recepcion.controller.ts`|
|DELETE|`/api/v1/recintos/:id/plano`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|GET|`/api/v1/recintos/:id/plano`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|PUT|`/api/v1/recintos/:id/plano`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|DELETE|`/api/v1/recintos/:id`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|GET|`/api/v1/recintos/:id`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|PUT|`/api/v1/recintos/:id`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|GET|`/api/v1/recintos`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|POST|`/api/v1/recintos`|SesionValida; Organizador, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|DELETE|`/api/v1/sesiones/actual`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/sesiones/sesiones.controller.ts`|
|GET|`/api/v1/sesiones/actual`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/sesiones/sesiones.controller.ts`|
|GET|`/api/v1/sesiones/verificar`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/sesiones/sesiones.controller.ts`|

## DAST: alcance diferente de la matriz

Dos familias activas: SQLi 40018 y XSS reflejado 40012; tres operaciones únicas/cuatro escenarios. GET Cartelera filtrado a un evento propio, PATCH perfil con/sin sesión y GET pedidos del establecimiento propio por Personal. Credenciales frescas, comprobadas antes/durante/después; sin Administrador.

La categoría se fija como límite de datos y se excluye como vector. Solo query/cuerpo JSON; no URI, cookies, cabeceras ni IDs. Contextos exactos, sin recursión/arañas, un hilo. No se ocultan alertas; el resto de reglas activas no se ejecuta y se lista en la evidencia. Se conservan las 62 pasivas.

Fuera: las otras operaciones, mutaciones generales, compra/pago/reembolso, cancelación/entrega por scanner, administración, cambio de contraseña, correo, webhooks como objetivo activo, AMQP, archivos, SSE, DOM/XSS persistido, SSRF/OOB, RCE, cargas/DoS y terceros. Motivo: efectos irreversibles o alcance/fixtures no definidos; no se declaran cubiertos.

Organizador/Administrador y jefe local tienen supervisión global por contrato actual. No existe una relación organización-evento que permita demostrar aislamiento de tenant; creadoPor es auditoría. Definir esa frontera sigue pendiente; CU-028 dinámico no se implementa.
