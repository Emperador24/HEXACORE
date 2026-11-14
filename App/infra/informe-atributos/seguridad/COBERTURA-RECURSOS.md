# Cobertura por recurso — 13/11/2026, Parqueaderos

**113/159 operaciones protegidas** con ampliación semántica real por gateway y
backend; **46 pendientes**. Parqueaderos **25/25**, Compras **8/8**, Reventa **11/11**
y Alimentos **30/30**. Se agregan exactamente las 25 pendientes de Parqueaderos,
por método/ruta; inventario intacto **178 declaradas / 173 expuestas / 159 protegidas**.
HEAD implícito no duplica GET. Las 88 cubiertas antes se reutilizan; sus fuentes
relevantes no cambian en esta entrega. Los cortes históricos y sus fallos se conservan.

Tres finales nuevas **300/300 cada una**, con positivos de las **25 rutas por
cada canal**. Por final: 292 observaciones semánticas, dos DTO, dos temporales y
cuatro de revocación SSE separadas. **116 comparaciones SQL/Redis** conservadas:
102 rechazos HTTP de autorización/contexto, cuatro lotes semánticamente rechazados,
dos temporales, dos DTO y seis reenvíos idempotentes autorizados. Los errores de
DTO/tiempo no acreditan autorización; recursos existentes y controles positivos.

Brecha demostrada antes: IDs offline de ingreso/salida A reenviados bajo B
exponían estancias de A como REPETIDO, en ambos canales. Se exige el evento
original y se devuelve REGISTRO_LOCAL_INCOMPATIBLE sin mutaciones ni consumo de
claves ajenas; idempotencia dentro de A intacta. Se cubre también la recuperación
concurrente de ingreso. Reservas/pagos mantienen propietario de sesión; zonas,
espacios, QR y redirecciones conservan el contexto del evento y la auditoría.

Roles operativos globales y disponibilidad compartida conforme al contrato;
salida conserva liquidación actual sin nuevo pago electrónico. Tarifa positiva
solo en base vacía/Redis/vhost nuevos, con la tarifa preexistente vacía intacta.
SSE autoriza al conectar y emite un evento válido; flujo abierto sigue emitiendo
tras revocar sesión y nueva conexión recibe 401. Se cierran recursos del flujo;
no se acredita revocación continua de conexiones existentes.

[Contratos y reproducción](AUTORIZACION-PARQUEADEROS.md) ·
[Evidencia nueva permitida](PARQUEADEROS-RECURSOS-EVIDENCIA.json) ·
[Compras/Reventa anterior](VENTAS-RECURSOS-EVIDENCIA.json) ·
[Alimentos anterior](ALIMENTOS-RECURSOS-EVIDENCIA.json) ·
[49/159 histórico](RECURSOS-DAST-EVIDENCIA.json).
Cubrir una operación no agota combinaciones/carreras/estados. Las 46 pendientes
conservan identidad/roles anteriores; **RNF-05/06 siguen parciales**. No se amplía
DAST ni se repiten localmente los 16 recorridos completos.

| Método | Ruta | Regla efectiva revisada | Prueba por gateway/directo | Ubicación |
|---|---|---|---|---|
|POST|`/api/v1/cola/eventos/:eventoId/turnos`|SesionValida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/entradas/fila/cola/cola.controller.ts`|
|GET|`/api/v1/cola/eventos/:eventoId`|SesionValida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/entradas/fila/cola/cola.controller.ts`|
|POST|`/api/v1/compras/:id/cancelacion/cotizacion`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|POST|`/api/v1/compras/:id/cancelaciones`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|DELETE|`/api/v1/compras/:id/cupon`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|PUT|`/api/v1/compras/:id/cupon`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|POST|`/api/v1/compras/:id/pagar`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|GET|`/api/v1/compras/:id`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|GET|`/api/v1/compras`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|POST|`/api/v1/compras`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/ventas/venta/compras.controller.ts`|
|GET|`/api/v1/ingresos/eventos/:eventoId/cache`|SesionValida; Personal, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/ingresos/sincronizacion`|SesionValida; Personal, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/ingresos`|SesionValida; Personal, Administrador|Pendiente semántica; conservar identidad/rol previos|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/reventa/checkout/:id/pagar`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|DELETE|`/api/v1/reventa/checkout/:id`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/checkout/:id`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/reventa/mantenimiento/expirar-publicaciones`|SesionValida; Administrador|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/mis-entradas`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/reventa/publicaciones/:id/checkout`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|DELETE|`/api/v1/reventa/publicaciones/:id`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/publicaciones/:id`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|PATCH|`/api/v1/reventa/publicaciones/:id`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|GET|`/api/v1/reventa/publicaciones`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
|POST|`/api/v1/reventa/publicaciones`|SesionValida; Cliente|Sí; Compras/Reventa 3×150; ambas vías, con positivos|`App/backend/modulos/entradas/postventa/postventa/reventa.controller.ts`|
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
|GET|`/api/v1/parqueaderos/eventos/:eventoId/asignaciones`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/cache`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/disponibilidad`|SesionValida; Cliente, Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/espacios/:espacioId`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/espacios`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/ingresos`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion/flujo`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/recomendacion`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones/:redireccionId`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/salidas`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/sincronizacion`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/vehiculos`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|DELETE|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/reservas/:id/pagar`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/reservas/:id`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/reservas`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/tarifa`|SesionValida; Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PUT|`/api/v1/parqueaderos/tarifa`|SesionValida; Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
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
