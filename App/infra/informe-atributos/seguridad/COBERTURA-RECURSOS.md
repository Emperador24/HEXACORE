# Cobertura por recurso — 15/11/2026 Bogotá, cierre del inventario

## Cierre de las 16 pendientes — corte vigente

**167/167 protegidas; cero operaciones pendientes del inventario. RNF-05/06
siguen parciales.** Nuevas: cuentas5, roles/permisos8 y QR3; cada método/ruta
por gateway y servicio directo con recursos/estados válidos y positivos.
Inventario sin cambios **186 declaradas / 181 expuestas / 167 protegidas**.
Las 151 anteriores conservan su evidencia y combinaciones; no se repiten sus
matrices ni se acredita toda combinación de permisos, estado o consumidor.

Dos brechas demostradas: asignaciones nuevas bloqueadas en gateway por JWT
anterior y recuperación del privilegio antiguo ante roles Redis ilegibles.
Corregidas en **8eae8b9**. Tres finales de cierre **560/560**, **346 conservaciones
de 76 tablas/planos/secuencias/Redis por final**, 236 rechazos de autorización.
Datos/DTO/estado/contexto/dependencia/carreras se separan. Las carreras de último
administrador admiten una mutación válida y rechazan la segunda; no se cuentan
como igualdad global. Evidencia previa y todos los fallos del arnés conservados.

[Contrato y pendientes](AUTORIZACION-CIERRE.md) · [Evidencia saneada](CIERRE-EVIDENCIA.json) ·
[Resultado](RESULTADO.md). El plan de dos servidores y un cliente es documental;
no añade cobertura ni ejecuta VPN/caídas.

## Corte anterior — Evacuación/Monitoreo

**151/167 protegidas; 16 pendientes. RNF-05/06 parciales.** Se agregan las
**22/22 de Evacuación/Monitoreo** (16/6) por gateway y Núcleo, incluidos dos SSE.
Inventario actual **186 declaradas / 181 expuestas / 167 protegidas**: develop
36998aa incorporó ocho protegidas CU-028 (admin/roles y cuentas/permisos), que
permanecen pendientes. Las ocho antiguas pendientes son Acceso QR3/Admin cuentas5.
Las 129 anteriores conservan su evidencia y combinaciones probadas; no se atribuye
esa evidencia a todas las combinaciones de la nueva matriz dinámica.

Tres finales seriales de cierre **510/510** cada una: 470 semánticas, 32 de
contexto, 4 DTO y 4 estado. **256 comparaciones completas de 76 tablas**, avisos,
historial, planos, secuencias y Redis; **216 rechazos de autorización**. Positivos
de las 22 rutas para Organizador y Administrador en cada canal; Personal solo
las tres operaciones de campo declaradas, sin asignaciones ni propiedad inventadas.
Lector/creador/actualizador propios prueban los permisos vigentes, sin desarrollar
CU-028 ni declarar cubiertas sus ocho rutas nuevas.

Ambos SSE revalidan sesión y permiso en sus ciclos 2/3 s y antes de emitir;
terminal saneado y EOF, sin datos tardíos. Revocación, exp, fallo Redis, permiso
retirado, consulta pendiente, desconexión y SIGTERM5s; regresión acotada del SSE
anterior. Ventana periódica, no instantánea; no se certifica RNF-17.

[Contrato y reproducción](AUTORIZACION-OPERACION.md) ·
[Evidencia](OPERACION-EVIDENCIA.json) · [Resultado e incidencias](RESULTADO.md).
La serie inicial interrumpida por un acuse asíncrono se conserva y se explica;
la precondición corregida mantiene límites y compara todos los campos. No repetir
los 16 recorridos ni 300 controles históricos; sin ampliación DAST.

## Corte anterior — 14/11/2026 Bogotá, Eventos/Recintos

**129/159 operaciones protegidas; 30 pendientes. RNF-05/06 parciales.** Se
agregan las **16/16 de Eventos/Recintos**, por gateway y Núcleo directo, sin
cambiar el inventario: **178 declaradas / 173 expuestas / 159 protegidas**.
Las 113 anteriores se reutilizan, incluida la corrección SSE de Parqueaderos;
sus fallos y límites se conservan. No se repiten 300 controles ni 16 recorridos.

Tres finales normalizadas **218/218** cada una: 206 semánticas, ocho contexto,
dos DTO y dos estado. Positivos de 16 métodos/rutas por canal, 76 rechazos de
autorización y 88 comparaciones completas de 74 tablas/planos/secuencias/Redis.
Administrador consulta Eventos, Organizador los muta; ambos gestionan Recintos.
Roles globales, creadoPor es auditoría. Dos reasignaciones al crear con ids de
zona/localidad existentes demostradas y corregidas, con regresiones HTTP.
Errores DTO, versión e inexistencia no acreditan autorización. El fallo de la
primera serie por orden de tablas se conserva separado de las tres finales.

[Contrato y reproducción](AUTORIZACION-EVENTOS.md) ·
[Evidencia nueva](EVENTOS-RECINTOS-EVIDENCIA.json) · [Resultado](RESULTADO.md).
Cubrir una operación no agota combinaciones, carreras ni estados. Las 30
pendientes conservan las comprobaciones anteriores de identidad/rol; no se
declaran RNF-05/06 completos ni se amplía DAST.

## Corte anterior conservado — 13/11/2026, Parqueaderos

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
SSE conserva autorización inicial y ahora revalida en su ciclo de 3 s y antes
de emitir; revocación/caducidad/fallo Redis cierran con evento saneado y EOF.
[Tres finales SSE](SSE-PARQUEADEROS-EVIDENCIA.json) por gateway/Núcleo, sin datos
posteriores y sin repetir los 300 controles. No se promete revocación instantánea
ni aumenta la cobertura por esta corrección: **113/159**, 46 pendientes.

[Contratos y reproducción](AUTORIZACION-PARQUEADEROS.md) ·
[Evidencia nueva permitida](PARQUEADEROS-RECURSOS-EVIDENCIA.json) ·
[Compras/Reventa anterior](VENTAS-RECURSOS-EVIDENCIA.json) ·
[Alimentos anterior](ALIMENTOS-RECURSOS-EVIDENCIA.json) ·
[49/159 histórico](RECURSOS-DAST-EVIDENCIA.json).
Cubrir una operación no agota combinaciones/carreras/estados. Las 46 pendientes
conservan identidad/roles anteriores; **RNF-05/06 siguen parciales**. No se amplía
DAST ni se repiten localmente los 16 recorridos completos.

## Inventario vigente por método y ruta — 151/167

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
|GET|`/api/v1/ingresos/eventos/:eventoId/cache`|SesionValida; Personal, Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/ingresos/sincronizacion`|SesionValida; Personal, Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
|POST|`/api/v1/ingresos`|SesionValida; Personal, Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/entradas/acceso-qr/acceso/ingresos.controller.ts`|
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
|POST|`/api/v1/admin/cuentas/:id/activar`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|POST|`/api/v1/admin/cuentas/:id/desactivar`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|DELETE|`/api/v1/admin/cuentas/:id`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|GET|`/api/v1/admin/cuentas/:id`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|GET|`/api/v1/admin/cuentas`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/administracion-cuentas/administracion-cuentas.controller.ts`|
|DELETE|`/api/v1/admin/roles/:id/usuarios/:usuarioId`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|POST|`/api/v1/admin/roles/:id/usuarios`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|DELETE|`/api/v1/admin/roles/:id`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|GET|`/api/v1/admin/roles/:id`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|PUT|`/api/v1/admin/roles/:id`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|GET|`/api/v1/admin/roles`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|POST|`/api/v1/admin/roles`|SesionRequerida, AdministradorRequerido; Administrador|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|PUT|`/api/v1/cuentas/perfil/contrasena`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/cuentas/perfil.controller.ts`|
|GET|`/api/v1/cuentas/perfil`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/cuentas/perfil.controller.ts`|
|PATCH|`/api/v1/cuentas/perfil`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/cuentas/perfil.controller.ts`|
|GET|`/api/v1/cuentas/permisos`|SesionRequerida; identidad/contexto del servicio|Sí; Cierre 3×560; gateway/directo, positivos y conservación|`App/backend/modulos/identidad/roles-permisos/roles-permisos.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/confirmar`|SesionValida; Organizador, Administrador; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/descartar`|SesionValida; Organizador, Administrador; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/finalizar`|SesionValida; Organizador, Administrador; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/evacuaciones/:id/flujo`|SesionValida; Organizador, Administrador; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/nivel`|SesionValida; Organizador, Administrador; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/evacuaciones/:id/reporte`|SesionValida; Organizador, Administrador; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/salidas/:salidaId/bloqueo`|SesionValida; Organizador, Administrador, Personal; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/evacuaciones/:id/zonas/:zonaId/ruta`|SesionValida; Organizador, Administrador; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|PATCH|`/api/v1/emergencias/evacuaciones/:id/zonas/:zonaId`|SesionValida; Organizador, Administrador, Personal; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/evacuaciones/:id`|SesionValida; Organizador, Administrador; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/eventos/:eventoId/activa`|SesionValida; Organizador, Administrador, Personal; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/eventos/:eventoId/evacuaciones`|SesionValida; Organizador, Administrador; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/emergencias/eventos/:eventoId/evacuaciones`|SesionValida; Organizador, Administrador; o permiso emergencias:crear|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/eventos`|SesionValida; Organizador, Administrador; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|GET|`/api/v1/emergencias/recintos/:recintoId/plan`|SesionValida; Organizador, Administrador; o permiso emergencias:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|PUT|`/api/v1/emergencias/recintos/:recintoId/plan`|SesionValida; Organizador, Administrador; o permiso emergencias:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/evacuacion/evacuacion.controller.ts`|
|POST|`/api/v1/eventos/:id/cancelar`|SesionValida; Organizador; o permiso eventos:actualizar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|POST|`/api/v1/eventos/:id/publicar`|SesionValida; Organizador; o permiso eventos:actualizar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|DELETE|`/api/v1/eventos/:id`|SesionValida; Organizador; o permiso eventos:eliminar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/eventos/:id`|SesionValida; Organizador, Administrador; o permiso eventos:leer|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|PUT|`/api/v1/eventos/:id`|SesionValida; Organizador; o permiso eventos:actualizar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/eventos/disponibilidad`|SesionValida; Organizador, Administrador; o permiso eventos:leer|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|GET|`/api/v1/eventos`|SesionValida; Organizador, Administrador; o permiso eventos:leer|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
|POST|`/api/v1/eventos`|SesionValida; Organizador; o permiso eventos:crear|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/eventos/eventos.controller.ts`|
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
|GET|`/api/v1/monitoreo/eventos/:id/alertas`|SesionValida; Organizador, Administrador; o permiso reportes:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|PATCH|`/api/v1/monitoreo/eventos/:id/decisiones/:decisionId`|SesionValida; Organizador, Administrador; o permiso reportes:actualizar|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|POST|`/api/v1/monitoreo/eventos/:id/decisiones`|SesionValida; Organizador, Administrador; o permiso reportes:crear|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos/:id/flujo`|SesionValida; Organizador, Administrador; o permiso reportes:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos/:id/panel`|SesionValida; Organizador, Administrador; o permiso reportes:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/monitoreo/eventos`|SesionValida; Organizador, Administrador; o permiso reportes:leer|Sí; Operación 3×510 + SSE, ambas vías, positivos Org/Admin|`App/backend/modulos/operacion/monitoreo/monitoreo.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/asignaciones`|SesionValida; Organizador, Administrador; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/cache`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/disponibilidad`|SesionValida; Cliente, Organizador, Administrador, Personal|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/espacios/:espacioId`|SesionValida; Organizador, Administrador; o permiso parqueaderos:actualizar|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/espacios`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/ingresos`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:crear|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion/flujo`|SesionValida; Organizador, Administrador; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/ocupacion`|SesionValida; Organizador, Administrador; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/recomendacion`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones/:redireccionId`|SesionValida; Organizador, Administrador; o permiso parqueaderos:actualizar|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/redirecciones`|SesionValida; Organizador, Administrador; o permiso parqueaderos:crear|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|SesionValida; Organizador, Administrador|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/reservas`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/salidas`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:crear|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/sincronizacion`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:crear|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/vehiculos`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|DELETE|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|SesionValida; Organizador, Administrador; o permiso parqueaderos:eliminar|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PATCH|`/api/v1/parqueaderos/eventos/:eventoId/zonas/:zonaId`|SesionValida; Organizador, Administrador; o permiso parqueaderos:actualizar|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|GET|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/eventos/:eventoId/zonas`|SesionValida; Organizador, Administrador; o permiso parqueaderos:crear|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|POST|`/api/v1/parqueaderos/reservas/:id/pagar`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/reservas/:id`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/reservas`|SesionValida; Cliente|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/reservas/reservas.controller.ts`|
|GET|`/api/v1/parqueaderos/tarifa`|SesionValida; Organizador, Administrador, Personal; o permiso parqueaderos:leer|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
|PUT|`/api/v1/parqueaderos/tarifa`|SesionValida; Administrador; o permiso parqueaderos:actualizar|Sí; Parqueaderos 3×300; ambas vías, con positivos|`App/backend/modulos/parqueaderos/parqueaderos.controller.ts`|
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
|DELETE|`/api/v1/recintos/:id/plano`|SesionValida; Organizador, Administrador; o permiso eventos:eliminar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|GET|`/api/v1/recintos/:id/plano`|SesionValida; Organizador, Administrador; o permiso eventos:leer|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|PUT|`/api/v1/recintos/:id/plano`|SesionValida; Organizador, Administrador; o permiso eventos:actualizar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|DELETE|`/api/v1/recintos/:id`|SesionValida; Organizador, Administrador; o permiso eventos:eliminar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|GET|`/api/v1/recintos/:id`|SesionValida; Organizador, Administrador; o permiso eventos:leer|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|PUT|`/api/v1/recintos/:id`|SesionValida; Organizador, Administrador; o permiso eventos:actualizar|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|GET|`/api/v1/recintos`|SesionValida; Organizador, Administrador; o permiso eventos:leer|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|POST|`/api/v1/recintos`|SesionValida; Organizador, Administrador; o permiso eventos:crear|Sí; Eventos/Recintos 3×218; ambas vías, con positivos|`App/backend/modulos/eventos-recintos/recintos/recintos.controller.ts`|
|DELETE|`/api/v1/sesiones/actual`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/sesiones/sesiones.controller.ts`|
|GET|`/api/v1/sesiones/actual`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/sesiones/sesiones.controller.ts`|
|GET|`/api/v1/sesiones/verificar`|SesionRequerida; identidad/contexto del servicio|Sí; contexto probado, combinaciones limitadas|`App/backend/modulos/identidad/sesiones/sesiones.controller.ts`|

## DAST: alcance diferente de la matriz

Dos familias activas: SQLi 40018 y XSS reflejado 40012; tres operaciones únicas/cuatro escenarios. GET Cartelera filtrado a un evento propio, PATCH perfil con/sin sesión y GET pedidos del establecimiento propio por Personal. Credenciales frescas, comprobadas antes/durante/después; sin Administrador.

La categoría se fija como límite de datos y se excluye como vector. Solo query/cuerpo JSON; no URI, cookies, cabeceras ni IDs. Contextos exactos, sin recursión/arañas, un hilo. No se ocultan alertas; el resto de reglas activas no se ejecuta y se lista en la evidencia. Se conservan las 62 pasivas.

Fuera: las otras operaciones, mutaciones generales, compra/pago/reembolso, cancelación/entrega por scanner, administración, cambio de contraseña, correo, webhooks como objetivo activo, AMQP, archivos, SSE, DOM/XSS persistido, SSRF/OOB, RCE, cargas/DoS y terceros. Motivo: efectos irreversibles o alcance/fixtures no definidos; no se declaran cubiertos.

Organizador/Administrador y jefe local tienen supervisión global por contrato actual. No existe una relación organización-evento que permita demostrar aislamiento de tenant; creadoPor es auditoría. Definir esa frontera sigue pendiente; CU-028 dinámico no se implementa.
