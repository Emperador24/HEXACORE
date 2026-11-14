# Inventario RNF-06 — 2026-11-12


**Actualización 13/11, autorización/DAST:** se conserva esta tabla histórica.
El denominador continúa en 178 controladores/159 protegidas/173 expuestas.
Las dos escrituras de asistencia ahora declaran rol operativo: quedan 39 sin
metadato explícito, frente a las 41 originales. Las 41 se incluyen en la nueva
matriz; esto no equivale a comprobar todas las combinaciones semánticas.
[Tabla actual de las 159 rutas, cobertura nueva y pendientes](COBERTURA-RECURSOS.md).

Fuentes funcionales e5c6ba79669ad355c05f5763fb17bfe7e29f8388. Metadatos Nest actuales y locations del gateway; no lista histórica de octubre.

178 operaciones de controlador: {'publica': 10, 'protegida': 159, 'interna': 5, 'operacional': 2, 'webhook': 2}.
172 operaciones de controlador se enrutan por gateway. Sumando GET /salud del gateway: **173 operaciones expuestas declaradas**.
OPTIONS global es preflight público sin datos de negocio, separado de ese denominador. HEAD implícito no duplica GET.
Boletería GET /api/v1/salud es solo directo; cinco operaciones internas no se enrutan. /_auth es interno de Nginx; Swagger no productivo es diagnóstico directo, no se enruta.

Las 159 operaciones protegidas tienen prueba negativa en ambos canales. Las pruebas de rol explícito cubren 117; una admite los cuatro roles. Las 41 sin metadato de rol se detallan al final.

| Programa | Método | Ruta | Clase | Gateway | Guarda / roles |
|---|---|---|---|---|---|
|boleteria|GET|`/api/v1/cartelera/:id`|publica|sí| / sesión/contexto|
|boleteria|GET|`/api/v1/cartelera/filtros`|publica|sí| / sesión/contexto|
|boleteria|GET|`/api/v1/cartelera`|publica|sí| / sesión/contexto|
|boleteria|POST|`/api/v1/cola/eventos/:eventoId/turnos`|protegida|sí|SesionValida / sesión/contexto|
|boleteria|GET|`/api/v1/cola/eventos/:eventoId`|protegida|sí|SesionValida / sesión/contexto|
|boleteria|POST|`/api/v1/compras/:id/cancelacion/cotizacion`|protegida|sí|SesionValida / Cliente|
|boleteria|POST|`/api/v1/compras/:id/cancelaciones`|protegida|sí|SesionValida / Cliente|
|boleteria|DELETE|`/api/v1/compras/:id/cupon`|protegida|sí|SesionValida / Cliente|
|boleteria|PUT|`/api/v1/compras/:id/cupon`|protegida|sí|SesionValida / Cliente|
|boleteria|POST|`/api/v1/compras/:id/pagar`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/compras/:id`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/compras`|protegida|sí|SesionValida / Cliente|
|boleteria|POST|`/api/v1/compras`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/ingresos/eventos/:eventoId/cache`|protegida|sí|SesionValida / Personal, Administrador|
|boleteria|POST|`/api/v1/ingresos/sincronizacion`|protegida|sí|SesionValida / Personal, Administrador|
|boleteria|POST|`/api/v1/ingresos`|protegida|sí|SesionValida / Personal, Administrador|
|boleteria|DELETE|`/api/v1/interno/cola/turnos/:token`|interna|no|SesionValida / sesión/contexto|
|boleteria|GET|`/api/v1/interno/entradas/de/:propietarioId`|interna|no|LlamadaInterna / sesión/contexto|
|boleteria|POST|`/api/v1/interno/entradas/devolver-de-reventa`|interna|no|LlamadaInterna / sesión/contexto|
|boleteria|POST|`/api/v1/interno/entradas/marcar-en-reventa`|interna|no|LlamadaInterna / sesión/contexto|
|boleteria|POST|`/api/v1/interno/entradas/transferir`|interna|no|LlamadaInterna / sesión/contexto|
|boleteria|POST|`/api/v1/reventa/checkout/:id/pagar`|protegida|sí|SesionValida / Cliente|
|boleteria|DELETE|`/api/v1/reventa/checkout/:id`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/reventa/checkout/:id`|protegida|sí|SesionValida / Cliente|
|boleteria|POST|`/api/v1/reventa/mantenimiento/expirar-publicaciones`|protegida|sí|SesionValida / Administrador|
|boleteria|GET|`/api/v1/reventa/mis-entradas`|protegida|sí|SesionValida / Cliente|
|boleteria|POST|`/api/v1/reventa/publicaciones/:id/checkout`|protegida|sí|SesionValida / Cliente|
|boleteria|DELETE|`/api/v1/reventa/publicaciones/:id`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/reventa/publicaciones/:id`|protegida|sí|SesionValida / Cliente|
|boleteria|PATCH|`/api/v1/reventa/publicaciones/:id`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/reventa/publicaciones`|protegida|sí|SesionValida / Cliente|
|boleteria|POST|`/api/v1/reventa/publicaciones`|protegida|sí|SesionValida / Cliente|
|boleteria|GET|`/api/v1/salud`|operacional|no| / sesión/contexto|
|nucleo|POST|`/api/v1/admin/cuentas/:id/activar`|protegida|sí|SesionRequerida, AdministradorRequerido / Administrador|
|nucleo|POST|`/api/v1/admin/cuentas/:id/desactivar`|protegida|sí|SesionRequerida, AdministradorRequerido / Administrador|
|nucleo|DELETE|`/api/v1/admin/cuentas/:id`|protegida|sí|SesionRequerida, AdministradorRequerido / Administrador|
|nucleo|GET|`/api/v1/admin/cuentas/:id`|protegida|sí|SesionRequerida, AdministradorRequerido / Administrador|
|nucleo|GET|`/api/v1/admin/cuentas`|protegida|sí|SesionRequerida, AdministradorRequerido / Administrador|
|nucleo|PUT|`/api/v1/cuentas/perfil/contrasena`|protegida|sí|SesionRequerida / sesión/contexto|
|nucleo|GET|`/api/v1/cuentas/perfil`|protegida|sí|SesionRequerida / sesión/contexto|
|nucleo|PATCH|`/api/v1/cuentas/perfil`|protegida|sí|SesionRequerida / sesión/contexto|
|nucleo|POST|`/api/v1/cuentas/recuperacion`|publica|sí| / sesión/contexto|
|nucleo|POST|`/api/v1/cuentas/registro`|publica|sí| / sesión/contexto|
|nucleo|POST|`/api/v1/cuentas/restablecer`|publica|sí| / sesión/contexto|
|nucleo|POST|`/api/v1/cuentas/verificar`|publica|sí| / sesión/contexto|
|nucleo|POST|`/api/v1/emergencias/evacuaciones/:id/confirmar`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/emergencias/evacuaciones/:id/descartar`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/emergencias/evacuaciones/:id/finalizar`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/emergencias/evacuaciones/:id/flujo`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/emergencias/evacuaciones/:id/nivel`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/emergencias/evacuaciones/:id/reporte`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/emergencias/evacuaciones/:id/salidas/:salidaId/bloqueo`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|POST|`/api/v1/emergencias/evacuaciones/:id/zonas/:zonaId/ruta`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PATCH|`/api/v1/emergencias/evacuaciones/:id/zonas/:zonaId`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|GET|`/api/v1/emergencias/evacuaciones/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/emergencias/eventos/:eventoId/activa`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|GET|`/api/v1/emergencias/eventos/:eventoId/evacuaciones`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/emergencias/eventos/:eventoId/evacuaciones`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/emergencias/eventos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/emergencias/recintos/:recintoId/plan`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PUT|`/api/v1/emergencias/recintos/:recintoId/plan`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/eventos/:id/cancelar`|protegida|sí|SesionValida / Organizador|
|nucleo|POST|`/api/v1/eventos/:id/publicar`|protegida|sí|SesionValida / Organizador|
|nucleo|DELETE|`/api/v1/eventos/:id`|protegida|sí|SesionValida / Organizador|
|nucleo|GET|`/api/v1/eventos/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PUT|`/api/v1/eventos/:id`|protegida|sí|SesionValida / Organizador|
|nucleo|GET|`/api/v1/eventos/disponibilidad`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/eventos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/eventos`|protegida|sí|SesionValida / Organizador|
|nucleo|GET|`/api/v1/logistica/asignaciones`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/asistencia/entrada`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/asistencia/estado`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/asistencia/reporte`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/asistencia/salida`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/asistencia`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/empleados/:id/desactivar`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/empleados/:id/reactivar`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/empleados/:id`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|PATCH|`/api/v1/logistica/empleados/:id`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/empleados/yo`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/empleados`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/empleados`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/notificaciones`|protegida|sí|SesionValida / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/personal-disponible`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/solicitudes-cambio/:solicitudId/cancelar`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/solicitudes-cambio/:solicitudId/historial`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/solicitudes-cambio/:solicitudId/reemplazos`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/solicitudes-cambio/:solicitudId/respuesta-reemplazo`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|PATCH|`/api/v1/logistica/solicitudes-cambio/:solicitudId/revisar`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/solicitudes-cambio`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/turnos/:turnoId/cancelar`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|PATCH|`/api/v1/logistica/turnos/:turnoId/reasignar`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/turnos/:turnoId/respuesta`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/turnos/:turnoId/solicitudes-cambio`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/turnos`|protegida|sí|SesionValida, ContextoDeLogistica / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/turnos`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/zonas/:zonaId/asignaciones`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/zonas/:zonaId/candidatos`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/logistica/zonas`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|POST|`/api/v1/logistica/zonas`|protegida|sí|SesionValida, ContextoDeLogistica, SoloQuienSupervisa / sesión/contexto|
|nucleo|GET|`/api/v1/monitoreo/eventos/:id/alertas`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PATCH|`/api/v1/monitoreo/eventos/:id/decisiones/:decisionId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/monitoreo/eventos/:id/decisiones`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/monitoreo/eventos/:id/flujo`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/monitoreo/eventos/:id/panel`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/monitoreo/eventos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/pagos/configuracion`|publica|sí| / sesión/contexto|
|nucleo|POST|`/api/v1/pagos/webhook/stripe`|webhook|sí| / sesión/contexto|
|nucleo|POST|`/api/v1/pagos/webhook`|webhook|sí| / sesión/contexto|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/asignaciones`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/cache`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/disponibilidad`|protegida|sí|SesionValida / Cliente, Organizador, Administrador, Personal|
|nucleo|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/espacios/:espacioId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/espacios`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|POST|`/api/v1/parqueaderos/eventos/:eventoId/ingresos`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion/flujo`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/recomendacion`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones/:redireccionId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|protegida|sí|SesionValida / Cliente|
|nucleo|POST|`/api/v1/parqueaderos/eventos/:eventoId/salidas`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|POST|`/api/v1/parqueaderos/eventos/:eventoId/sincronizacion`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/vehiculos`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|DELETE|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|POST|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/parqueaderos/reservas/:id/pagar`|protegida|sí|SesionValida / Cliente|
|nucleo|GET|`/api/v1/parqueaderos/reservas/:id`|protegida|sí|SesionValida / Cliente|
|nucleo|GET|`/api/v1/parqueaderos/reservas`|protegida|sí|SesionValida / Cliente|
|nucleo|GET|`/api/v1/parqueaderos/tarifa`|protegida|sí|SesionValida / Organizador, Administrador, Personal|
|nucleo|PUT|`/api/v1/parqueaderos/tarifa`|protegida|sí|SesionValida / Administrador|
|nucleo|POST|`/api/v1/pedidos/:pedidoId/pagos`|protegida|sí|SesionValida / Cliente|
|nucleo|PATCH|`/api/v1/pedidos/admin/establecimientos/:id/estado`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|DELETE|`/api/v1/pedidos/admin/establecimientos/:id/personal/:usuarioId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PUT|`/api/v1/pedidos/admin/establecimientos/:id/personal/:usuarioId`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/pedidos/admin/establecimientos/:id/personal`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/pedidos/admin/establecimientos/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PUT|`/api/v1/pedidos/admin/establecimientos/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/pedidos/admin/establecimientos/cuentas-personal`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/pedidos/admin/establecimientos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/pedidos/admin/establecimientos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/pedidos/checkout`|protegida|sí|SesionValida / Cliente|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/ajustes`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/entregas/confirmar`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/entregas/prevalidar`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/menu`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/operaciones/:operacionId`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/cancelacion`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/cancelacion`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/preparacion`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/pedidos`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/productos/:productoId/ajustes`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|PATCH|`/api/v1/pedidos/establecimientos/:establecimientoId/productos/:productoId`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|PUT|`/api/v1/pedidos/establecimientos/:establecimientoId/productos/:productoId`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/establecimientos/:establecimientoId/productos`|protegida|sí|SesionValida / sesión/contexto|
|nucleo|POST|`/api/v1/pedidos/establecimientos/:establecimientoId/productos`|protegida|sí|SesionValida, PersonalDelEstablecimiento / Personal|
|nucleo|GET|`/api/v1/pedidos/eventos/:eventoId/establecimientos`|protegida|sí|SesionValida / sesión/contexto|
|nucleo|GET|`/api/v1/pedidos/mis-establecimientos`|protegida|sí|SesionValida / Personal|
|nucleo|GET|`/api/v1/pedidos/mis-pedidos/:pedidoId`|protegida|sí|SesionValida / Cliente|
|nucleo|GET|`/api/v1/pedidos/mis-pedidos`|protegida|sí|SesionValida / Cliente|
|nucleo|DELETE|`/api/v1/recintos/:id/plano`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/recintos/:id/plano`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PUT|`/api/v1/recintos/:id/plano`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|DELETE|`/api/v1/recintos/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/recintos/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|PUT|`/api/v1/recintos/:id`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/recintos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|POST|`/api/v1/recintos`|protegida|sí|SesionValida / Organizador, Administrador|
|nucleo|GET|`/api/v1/salud`|operacional|sí| / sesión/contexto|
|nucleo|DELETE|`/api/v1/sesiones/actual`|protegida|sí|SesionRequerida / sesión/contexto|
|nucleo|GET|`/api/v1/sesiones/actual`|protegida|sí|SesionRequerida / sesión/contexto|
|nucleo|POST|`/api/v1/sesiones/renovar`|publica|sí| / sesión/contexto|
|nucleo|GET|`/api/v1/sesiones/verificar`|protegida|sí|SesionRequerida / sesión/contexto|
|nucleo|POST|`/api/v1/sesiones`|publica|sí| / sesión/contexto|

## Excepciones públicas justificadas

- `GET /api/v1/cartelera/:id`: Cartelera pública CU-005.
- `GET /api/v1/cartelera/filtros`: Cartelera pública CU-005.
- `GET /api/v1/cartelera`: Cartelera pública CU-005.
- `POST /api/v1/cuentas/recuperacion`: Emisión/recuperación de identidad; requiere su credencial específica.
- `POST /api/v1/cuentas/registro`: Emisión/recuperación de identidad; requiere su credencial específica.
- `POST /api/v1/cuentas/restablecer`: Emisión/recuperación de identidad; requiere su credencial específica.
- `POST /api/v1/cuentas/verificar`: Emisión/recuperación de identidad; requiere su credencial específica.
- `GET /api/v1/pagos/configuracion`: Selección pública del proveedor, sin clave privada.
- `POST /api/v1/sesiones/renovar`: Emisión/recuperación de identidad; requiere su credencial específica.
- `POST /api/v1/sesiones`: Emisión/recuperación de identidad; requiere su credencial específica.

Webhook simulado: HMAC del cuerpo. Stripe: firma propia, proveedor desactivado localmente; solo firma con dobles unitarios, no prueba dinámica Stripe. Salud no devuelve datos de usuario.

## Rutas sin metadato de rol explícito

No se cuenta un 400/404 como prueba de rol. Sesión/perfil y cola se autorizan por identidad/propiedad; ContextoDeLogistica y SoloQuienSupervisa usan organización/ficha y requieren ampliar fixtures para cada combinación. CU-028 dinámico sigue pendiente de Samuel.

- `POST /api/v1/cola/eventos/:eventoId/turnos` — SesionValida.
- `GET /api/v1/cola/eventos/:eventoId` — SesionValida.
- `PUT /api/v1/cuentas/perfil/contrasena` — SesionRequerida.
- `GET /api/v1/cuentas/perfil` — SesionRequerida.
- `PATCH /api/v1/cuentas/perfil` — SesionRequerida.
- `GET /api/v1/logistica/asignaciones` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/asistencia/entrada` — SesionValida, ContextoDeLogistica.
- `GET /api/v1/logistica/asistencia/estado` — SesionValida, ContextoDeLogistica.
- `GET /api/v1/logistica/asistencia/reporte` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/asistencia/salida` — SesionValida, ContextoDeLogistica.
- `GET /api/v1/logistica/asistencia` — SesionValida, ContextoDeLogistica.
- `POST /api/v1/logistica/empleados/:id/desactivar` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/empleados/:id/reactivar` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/empleados/:id` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `PATCH /api/v1/logistica/empleados/:id` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/empleados/yo` — SesionValida, ContextoDeLogistica.
- `GET /api/v1/logistica/empleados` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/empleados` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/notificaciones` — SesionValida.
- `GET /api/v1/logistica/personal-disponible` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/solicitudes-cambio/:solicitudId/cancelar` — SesionValida, ContextoDeLogistica.
- `GET /api/v1/logistica/solicitudes-cambio/:solicitudId/historial` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/solicitudes-cambio/:solicitudId/reemplazos` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/solicitudes-cambio/:solicitudId/respuesta-reemplazo` — SesionValida, ContextoDeLogistica.
- `PATCH /api/v1/logistica/solicitudes-cambio/:solicitudId/revisar` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/solicitudes-cambio` — SesionValida, ContextoDeLogistica.
- `POST /api/v1/logistica/turnos/:turnoId/cancelar` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `PATCH /api/v1/logistica/turnos/:turnoId/reasignar` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/turnos/:turnoId/respuesta` — SesionValida, ContextoDeLogistica.
- `POST /api/v1/logistica/turnos/:turnoId/solicitudes-cambio` — SesionValida, ContextoDeLogistica.
- `GET /api/v1/logistica/turnos` — SesionValida, ContextoDeLogistica.
- `POST /api/v1/logistica/turnos` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/zonas/:zonaId/asignaciones` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/zonas/:zonaId/candidatos` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/logistica/zonas` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `POST /api/v1/logistica/zonas` — SesionValida, ContextoDeLogistica, SoloQuienSupervisa.
- `GET /api/v1/pedidos/establecimientos/:establecimientoId/productos` — SesionValida.
- `GET /api/v1/pedidos/eventos/:eventoId/establecimientos` — SesionValida.
- `DELETE /api/v1/sesiones/actual` — SesionRequerida.
- `GET /api/v1/sesiones/actual` — SesionRequerida.
- `GET /api/v1/sesiones/verificar` — SesionRequerida.
