# Estado de migración de HEXACORE

Fecha de revisión: **1 de noviembre de 2026**, America/Bogota.
Alcance: diagnóstico inicial y **primer cambio de implementación: F05,
Compose remoto**, sobre la arquitectura actual. No se trasladaron servicios,
modificaron dependencias npm, aplicaron migraciones ni completaron casos de uso.

**Resultado actualizado:** se leyó completo
`Plan_Arquitectura_Migracion_HEXACORE.md` y se contrastó con este estado.
Docker Desktop responde con ServerVersion **29.7.2**. Los bloqueos anteriores
de plan ausente y daemon inaccesible quedan retirados. F05 está reparado y
validado en la configuración resuelta; **no se ejecutó el arranque remoto ni
la integración real**, que siguen pendientes. La línea base inicial de
compilaciones y pruebas se conserva como evidencia histórica, sin repetir
interfaces no afectadas.

El objetivo confirmado es **Núcleo modular, Boletería, Operación y Trabajador**:
tres aplicaciones de negocio y un trabajador técnico, con Pagos reutilizable
sin servidor exclusivo. También incluye **una base PostgreSQL `hexacore`
organizada por esquemas de módulo y un único registro financiero**. Conservar
las bases actuales al reunir procesos es una transición; su consolidación
posterior forma parte de la migración final, no es opcional. Ver §§12–13.

## 1. Identificación, instrucciones y conservación del trabajo

| Dato | Observación |
|---|---|
| Directorio | `/Users/sebastiansanchez/Documents/HEXACORE` |
| Rama verificada | `feature/sebastian-arquitectura` |
| HEAD revisado, sin cambios durante el diagnóstico | `2cd4fde22683d370dfe32991d983a0ae373b9908` |
| Último commit | Merge PR #43, `Feature/samuel`, 31 oct 2026 |
| Estado inicial | `git status --porcelain=v1 --branch`: solo `## feature/sebastian-arquitectura...origin/feature/sebastian-arquitectura`; sin cambios rastreados ni archivos nuevos visibles |
| Plan indicado como recién añadido | Ausente durante el diagnóstico inicial; ahora disponible, leído completo y preservado sin modificaciones. Sigue como archivo local no rastreado |
| Trabajo local aparecido durante la revisión | `App/services/pedidos/src/pagos/eventos/publicador-pedidos.service.ts`, no rastreado; preservado sin modificaciones. No forma parte del commit ni de los paquetes compilados |
| Archivos modificados por esta tarea | `App/infra/docker-compose.remoto.yml` y este estado. Sin commit, checkout, reset, limpieza de volúmenes ni escrituras en bases |

Se buscaron `AGENTS.md` en el repositorio, incluidos archivos ocultos, y en
los directorios ancestros: no se encontraron. Se leyeron `WORKFLOW.md`,
`README.md`, `App/README.md`, `Documentation/Work/README.md` y el archivo
`.claude/agents/claude.agent.md` (plantilla sin instrucciones operativas).
Se respetó la rama pedida. El documento de requisitos generado no se editó:
`RequisitosCasosUso.tex` deriva de `CU_eventos_completo.xlsx`.

Las compilaciones, instalaciones con lockfile y pruebas generaron únicamente
artefactos locales de herramientas. No se cambiaron `package.json`, lockfiles
ni fuentes de aplicaciones. La única configuración modificada en el seguimiento
es el override remoto. Los registros iniciales quedaron en
`/private/tmp/hexacore-diagnostico/`; la configuración resuelta y las
comprobaciones de F05 están en `/private/tmp/hexacore-compose-remoto/`.
Son auxiliares de esta sesión, no un requisito para reproducir los comandos.

## 2. Arquitectura documentada, implementada y acordada

| Nivel | Evidencia y diferencia |
|---|---|
| Requisitos | SRS, `RequisitosCasosUso.tex` y los 18 RNF describen 32 CU. Una agrupación nueva no completa un CU pendiente ni elimina sus restricciones |
| ADR-12 histórico | Núcleo, Entradas y Eventos/Emergencias. Sigue apareciendo como arquitectura desplegada en párrafos del SAD y scripts; ya no representa las diez aplicaciones presentes |
| ADR-14 documentado | 7 microservicios + 7 servicios de dominio, Pagos como servidor, base central por esquemas para dominios, escalado y réplica de lectura. No equivale al objetivo acordado de cuatro programas |
| ADR-15 documentado | JWT local en gateway, turno obligatorio, QR mediante proyección y outbox, webhook HMAC, eventos de publicación/cancelación de eventos. Parte está implementada y parte pendiente |
| Checkout implementado | **10 aplicaciones NestJS**, gateway Nginx/njs, 2 portales Angular y 1 app Flutter. Compose base: **18 servicios**, contando 5 piezas de datos/simuladores y las interfaces. Hay 8 bases con modelos de aplicaciones y otras 2 reservadas; una instancia PostgreSQL, Redis y RabbitMQ. Sin MongoDB desplegado, réplica de lectura, Kubernetes, CDN ni buscador dedicado |
| Interfaz | Existen tanto clientes HTTP reales como pantallas con listas locales, retardos y placeholders. No se contabilizan estas últimas como backend implementado |
| Destino acordado | Núcleo: identidad, eventos/recintos, alimentos, parqueaderos, personal/logística, proveedores, finanzas e informes. Boletería: cartelera, fila, compra, promociones, cancelación, reventa y acceso QR. Operación: monitoreo, incidentes y evacuaciones. Trabajador: notificaciones y tareas pendientes. Pagos: módulo reutilizable |
| Datos objetivo confirmados por el plan | Una base lógica `hexacore`, esquemas por módulo, propiedad de reglas y APIs internas; registro financiero común. Las bases separadas del checkout se mantienen solo durante la transición |

Fuentes contrastadas: `EspecificacionRequisitos.tex`, `RequisitosCasosUso.tex`,
`RequisitosNoFuncionales.tex`, secciones ASR/ADR/vistas del SAD,
`ADR-14-hibrida-soa-microservicios.tex`,
`ADR-15-correcciones-contenedores.tex`, `MIGRACION-ADR-14.md`, READMEs,
bootstrap y módulos, controladores, persistencia, clientes de las interfaces,
todos los Compose, `iniciar.sh` y workflows CI/CD.
En el seguimiento se añadió la lectura completa del plan (483 líneas), cuya
base revisada coincide con HEAD. Su rama de referencia es `develop`; esta
implementación continúa en la rama existente `feature/sebastian-arquitectura`
sin recrearla ni modificar el plan.

### Discrepancias del estado inicial corregidas al leer el plan

- Se elimina «consolidación de datos, si se decide»: el destino obligatorio
  es una base `hexacore` por esquemas (§6 del plan). El plan permite conexiones
  separadas al reunir procesos (§10, etapa 2), prevé reconciliar entradas sobre
  una copia en la etapa 3 y consolida los datos generales en la etapa 4.
- Se reemplaza el orden provisional de este estado por las etapas 0–7 del
  plan: base comprobable; workspace y Núcleo; Boletería; Pagos/trabajador/datos;
  Operación; funcionalidad pendiente; cierre de infraestructura y métricas.
- Se aclara que son tres aplicaciones de negocio más un trabajador, no cuatro
  dominios de negocio independientes. La carpeta objetivo del trabajador es
  `App/backend/apps/tareas`; los módulos y aplicaciones del resto de
  `App/backend` siguen siendo objetivo, no código ya creado.
- Las proyecciones y mensajes de QR se preservan durante la transición. El
  destino es un estado canónico transaccional de entrada, QR e ingreso, con
  retiro de copias solo después de reconciliarlas y verificar las carreras.
- Se incorporan como criterios pendientes: reservar la operación de pago antes
  del proveedor, webhook/trabajo durable, retiro o drenaje de tareas y reservas,
  capacidad reservada para alertas y reclamación entre réplicas. Operación debe
  funcionar con el proceso Núcleo detenido bajo las dependencias declaradas;
  offline y acuses de alertas siguen necesitando decisiones/pruebas reales.
- El plan requiere reformular RNF-13 para módulos y actualizar las restricciones
  de bases independientes de SAD/SRS. No se declaran satisfechos por cambiar
  nombres, ni se modificaron esos documentos en esta reparación.

Hay contradicciones verificables en los documentos existentes:

- ADR-14 dice «tomada y no ejecutada» y `MIGRACION-ADR-14.md` aún resume 6
  despliegues, pero el código y Compose ya tienen 10 backends.
- El README de Acceso QR describe llamadas a Ventas y compensación. El código
  actual valida localmente en PostgreSQL y se comunica mediante eventos.
- El README móvil dice que solo cuentas y reventa son reales. También existen
  `pedidos_api.dart`, pantallas de restaurante y `logistica_api_client.dart`
  conectados. Sus pruebas pasan con servidores/dobles de prueba; no se validó
  su integración con el sistema desplegado en esta sesión.
- Se documentan funciones como CU-019 y roles completos sin controladores que
  las respalden. El control de aforo de QR no constituye un tablero operativo.
- Las fichas de alimentos tienen referencias internas discordantes: CU-011
  menciona cancelación/reembolso como CU-015, mientras el encabezado generado
  de CU-015 es gestión de establecimientos. Corregir la trazabilidad en su
  fuente será una tarea separada; no inventar un backend para resolverla.

Las garantías a conservar incluyen RNF-01/02 (sin doble venta y QR viejo
inválido), 05/06 (tokenización y autorización), 11 (auditoría), 14 (contrato
común web/móvil), 16 (adaptador de pagos) y 18 (pruebas aislables). Los umbrales
de carga, disponibilidad, tiempo real y evacuación de RNF-03/04/07/08/09/10/17
**no quedaron certificados** por las pruebas locales de esta revisión.

## 3. Inventario y destino

Rutas de esta sección relativas a `App/`; «existente» significa código
concreto inspeccionado, no certificación de todos los alternos del CU.

| Componente actual | Aplicación/módulos observados y funcionalidad | Destino |
|---|---|---|
| `services/autenticacion` :3002 | `AdministracionModule`, cuentas/perfil, sesiones/renovación/revocación, administración de cuentas, publicador de correos, persistencia y seguridad. Roles base y asociaciones; sin CRUD completo de roles/recintos/proveedores/finanzas/reportes | Identidad del Núcleo |
| `services/alimentos` :3007 | `PedidosModule`: catálogo, menú, checkout, inventario/reservas, pagos del pedido y recepción. Consulta/edición acotada de productos, checkout multi-producto, expiración, cobro, confirmación/QR y listado de pedidos | Alimentos del Núcleo; conservar sus reglas propias de pago |
| `services/eventos-emergencias` :3016 | `TurnosAsistenciaModule`: empleados, zonas/asignación operativa, turnos, solicitudes de cambio, asistencia y notificaciones persistidas por mensajes. No contiene un motor de evacuaciones ni CRUD de incidentes | Personal/logística al Núcleo; vistas/consulta de notificaciones hacia Trabajador mediante contrato definido. Operación solo recibirá funcionalidad que exista o se construya en otra entrega |
| `services/ventas` :3001 | `VentaModule`, `ComunModule`: reserva/compra, cupones, cancelación/reembolso, dueño de entradas e historial, API interna, expiración y outbox/consumo de ingresos | Boletería |
| `services/catalogo` :3004 | `CarteleraModule`: lectura y filtros sobre tablas propias; proyección cargada por semilla, sin consumidor de eventos de publicación/cancelación | Cartelera de Boletería |
| `services/cola-virtual` :3009 | `ColaModule`: fila, aforo de compradores, turno con TTL y consumo único mediante Lua/Redis | Fila de Boletería |
| `services/postventa` :3011 | `ReventaModule`: publicar/modificar/retirar, checkout y pago/transferencia, compensaciones, expiración, consumidores de notificación/liquidación | Reventa de Boletería |
| `services/acceso-qr` :3010 | `AccesoModule`: proyección QR, validación+aforo+ingreso en transacción local, caché offline, sincronización, outbox de ingreso | Acceso de Boletería |
| `services/pagos` :3008 interno | Libro durable de operaciones, cobro/reembolso mediante pasarela HTTP, resultado incierto, webhook firmado y publicador de resultados | Biblioteca/módulo compartido; eliminar su servidor solo después de integrar y verificar llamantes y webhook |
| `services/notificaciones` :3006 | Consumidor de correos de cuentas y proveedor HTTP de correo; sin base propia ni API de tareas | Trabajador como sede propuesta del consumidor existente. No confundir correo de cuentas con tareas pendientes o push ya implementados |
| `services/personal`, `services/parqueaderos` | Solo READMEs versionados; sin `package.json`, módulos ejecutables ni migraciones | Módulos del Núcleo pendientes |
| `services/administracion`, `services/pedidos` | Directorios locales residuales con artefactos ignorados; no paquetes versionados. En Pedidos apareció además el archivo local señalado en §1 | Preservar trabajo local; no tratarlos como despliegues actuales ni copiarlos sobre Autenticación/Alimentos |
| Operación | No hay paquete backend propio; monitoreo/incidentes/evacuaciones sin implementación correspondiente | Programa objetivo pendiente de estructurar, sin completar CU ahora |
| Trabajador | No hay paquete backend propio ni modelo de tareas pendientes; piezas existentes repartidas entre correo y logística | Programa objetivo pendiente de estructurar |
| `gateway` :8080 | Nginx+njs, JWT RS256/roles, CORS, turno de compra, proxy y errores JSON | Conservar entrada y contratos; reenrutar gradualmente a los cuatro programas |
| `frontend/portal-web-cliente` :4200 | Angular: cuentas/sesiones, cartelera/compra/reventa y pedidos conectados; parqueadero local | Conservar contratos públicos y navegación |
| `frontend/portal-web-admin` :4201 | Angular: login/cuentas conectados; CRUD eventos/dashboard locales y otras secciones placeholder | Conservar interfaz; no declarar completados los CU simulados |
| `frontend/app-movil` | Una app Flutter para Cliente/Personal. Cuentas, reventa, pedidos/restaurante y turnos/asistencia usan HTTP. Compra primaria, pago genérico, parqueadero y varias pantallas operativas son simulados | No exige separar las apps móviles para tener cuatro programas de backend |
| `shared` | OpenAPI de ventas, JSON Schema `entrada-transferida`, contrato de token/revocación; sin workspace npm común | Mantener contratos y futura biblioteca de Pagos separada de contratos para Dart |
| `infra`, simuladores, `PoCs` | PostgreSQL/Redis/RabbitMQ; pasarela y correo simulados por HTTP; PoCs de concurrencia/broker/lenguaje | Soporte, no programas adicionales del negocio. Conservar simuladores de prueba |

### Funcionalidad pendiente y simulación observada

- CU-001/003/004/005/006 y acceso CU-002 tienen backend, pero la Saga de pago
  incierto no se cierra mediante eventos de Pagos en los llamantes. No declarar
  compra completa frente a todos los fallos externos.
- CU-011 tiene checkout/pago/confirmación; CU-012 tiene consulta y actualización
  acotadas de menú. Recepción lista pedidos, pero no hay ciclo completo de
  preparación, entrega QR, cancelación/reembolso ni CRUD completo de
  establecimientos (CU-013/014/015 y alternos correspondientes).
- Personal/logística tiene una implementación parcial real de asignaciones,
  turnos/cambios y asistencia (CU-017/018 y funciones solapadas con CU-007–009).
  No se certifican todos esos CU por tener modelos de empleado y turno.
- Sin backend completo de CU-010, CU-016, CU-019/020, CU-021–025, CU-026,
  CU-028–032. CU-027 sí tiene código de sus flujos principales; los roles de
  base y las cuentas administrables no equivalen a CU-028 completo.
- `portal-web-admin/src/app/core/eventos.service.ts` usa `EVENTOS_INICIALES`
  y `signal`, sin HTTP. `app.routes.ts` carga placeholders para personal,
  monitoreo, incidentes, emergencias, roles, recintos, proveedores, pagos e
  informes. El dashboard cuenta esos eventos locales.
- `portal-web-cliente/src/app/core/parqueadero.service.ts` genera espacios,
  identificadores y QR localmente. Su pantalla y pago visual no demuestran
  reserva/cobro real de parqueadero.
- `app-movil/lib/services/api_client.dart` implementa compra y pago mediante
  `Future.delayed`; `lib/main.dart` tiene validaciones de ejemplo e incidentes
  locales; `pages/notifications_page.dart` contiene una lista local, incluida
  una alerta de evacuación de ejemplo. El escáner de cámara no demuestra
  conexión con `/ingresos`: no existe cliente HTTP móvil de acceso QR en las
  fuentes inspeccionadas.
- En Reventa, `ConsumidorNotificaciones` registra lo que enviaría;
  `ConsumidorLiquidaciones` consulta transacción/referencia y registra el abono
  previsto, sin transferir dinero al vendedor. `NotificacionesVenta` registra
  avisos. Solo el consumidor de correos de cuentas llama al proveedor de
  correo HTTP, que a su vez es un simulador.

## 4. Contrato HTTP que debe conservarse

Todas las rutas de negocio siguientes llevan prefijo **`/api/v1`**. Se
inventariaron desde controladores y `gateway/nginx.conf`, no solo READMEs.
El destino puede cambiar; métodos, cuerpos/DTO, validación, estados HTTP,
códigos de error, cookies y cabeceras forman parte del comportamiento.

| Familia / backend actual | Métodos y rutas existentes |
|---|---|
| Cuentas / Autenticación | `POST /cuentas/registro`, `/cuentas/verificar`, `/cuentas/recuperacion`, `/cuentas/restablecer`; `GET/PATCH /cuentas/perfil`; `PUT /cuentas/perfil/contrasena` |
| Sesiones / Autenticación | `POST /sesiones`, `POST /sesiones/renovar`; `GET /sesiones/verificar`; `GET/DELETE /sesiones/actual` |
| Administración / Autenticación | `GET /admin/cuentas`, `GET /admin/cuentas/:id`, `POST /admin/cuentas/:id/activar`, `/desactivar`, `DELETE /admin/cuentas/:id` |
| Cartelera / Catálogo | `GET /cartelera`, `/cartelera/filtros`, `/cartelera/:id` |
| Fila / Cola virtual | `POST /cola/eventos/:eventoId/turnos`, `GET /cola/eventos/:eventoId` |
| Compra / Ventas | `POST/GET /compras`, `GET /compras/:id`, `POST /compras/:id/pagar`; `PUT/DELETE /compras/:id/cupon`; `POST /compras/:id/cancelacion/cotizacion`, `/compras/:id/cancelaciones` |
| Reventa / Postventa | `GET /reventa/mis-entradas`; `GET/POST /reventa/publicaciones`; `GET/PATCH/DELETE /reventa/publicaciones/:id`; `POST /reventa/publicaciones/:id/checkout`; `GET/DELETE /reventa/checkout/:id`; `POST /reventa/checkout/:id/pagar`; `POST /reventa/mantenimiento/expirar-publicaciones` |
| Puerta / Acceso QR | `POST /ingresos`; `GET /ingresos/eventos/:eventoId/cache`; `POST /ingresos/sincronizacion` |
| Pedidos / Alimentos | `GET /pedidos/eventos/:eventoId/establecimientos`; `GET /pedidos/establecimientos/:establecimientoId/productos`, `/menu`, `/pedidos`; `PATCH /pedidos/establecimientos/:establecimientoId/productos/:productoId`; `POST /pedidos/checkout`; `POST /pedidos/:pedidoId/pagos` |
| Personal / Eventos-Emergencias | `POST/GET /logistica/empleados`, `GET /logistica/empleados/yo`; `POST/GET /logistica/turnos`; `POST /logistica/turnos/:turnoId/solicitudes-cambio`; `GET /logistica/solicitudes-cambio`; `PATCH /logistica/solicitudes-cambio/:solicitudId/revisar`; `POST /logistica/asistencia/entrada`, `/salida`; `GET /logistica/asistencia`; `POST/GET /logistica/zonas`; `GET /logistica/personal-disponible`; `POST /logistica/zonas/:zonaId/asignaciones`; `PATCH /logistica/turnos/:turnoId/reasignar`; `GET /logistica/notificaciones` |
| Webhook / Pagos | `POST /pagos/webhook`, público con HMAC-SHA256 sobre cuerpo original en `X-Pasarela-Firma` |

El gateway deja públicas las rutas de emisión/recuperación de sesión y cuentas,
cartelera solo GET y webhook solo POST. Protege `/admin/` por Administrador,
compras por Cliente (POST inicial además consume `X-Turno-Cola`), ingresos
por Personal/Administrador y reventa por Cliente/Administrador. Pedidos,
sesiones y logística requieren token y añaden restricciones en los servicios.
Mantener RS256, emisor `hexacore-administracion`, `sub/roles/jti`, revocación
Redis `sesion-revocada:<jti>` y el comportamiento diferenciado de renovación
web mediante cookie y móvil mediante token. Conservar CORS y cabeceras
`Authorization`, `X-Hexacore-Cliente`, `Idempotency-Key`, `X-Turno-Cola` y
respuestas del gateway como `TURNO_REQUERIDO` (428).

Rutas internas que **no** se deben abrir al público al reunir módulos:

- Ventas: `GET /interno/entradas/de/:propietarioId`,
  `POST /interno/entradas/marcar-en-reventa`, `/devolver-de-reventa`,
  `/transferir`; protegidas con credencial de servicio y las reglas del
  controlador. Postventa usa `ClienteVentas` para estas operaciones.
- Cola: `DELETE /interno/cola/turnos/:token`, llamado por gateway con la sesión
  del comprador; turno de un solo uso y ligado al dueño.
- Pagos: `POST /pagos`, `POST /pagos/reembolsos`, con JWT reenviado por Ventas,
  Postventa y Alimentos; únicamente el webhook se enruta por el gateway.

Conservar también `/salud` del gateway, `/api/v1/salud` público actualmente
reenviado a Autenticación y las sondas directas de cada aplicación. Swagger se
publica por servicio, normalmente en `/api/v1/docs`; Eventos/Emergencias usa
`/docs`. No asumir que esas rutas están expuestas por el gateway.
Las rutas web `/cuenta/verificar` y `/cuenta/restablecer` reciben los enlaces
de correo y también deben sobrevivir al cambio de servidores.

## 5. Datos, entidades y migraciones

Inventario estático: no se consultó ni modificó el contenido de las bases
actuales porque el daemon Docker no estaba disponible. **Existencia de DDL en
Git no demuestra que una migración esté aplicada en un volumen existente.**

| Base / dueño actual | Entidades registradas / tablas |
|---|---|
| `administracion` / Autenticación | `Usuario/usuarios`, `Rol/roles`, `UsuarioRol/usuarios_roles`, `Sesion/sesiones`, `TokenCuenta/tokens_cuenta`, `AuditoriaCuenta/auditoria_cuentas` |
| `pedidos` / Alimentos | `EventoReferencia/eventos_referencia`, `Establecimiento/establecimientos`, `Producto/productos`, `Pedido/pedidos`, `DetallePedido/detalles_pedido`, `TransaccionPedido/transacciones_pedido`, `ReservaInventario/reservas_inventario` |
| `entradas_mercado_secundario` / Ventas | `EventoReferencia/eventos_referencia`, `LocalidadEvento/localidades_evento`, `Entrada/entradas`, `HistorialPropietario/historial_propietarios`, `Compra/compras`, `CodigoPromocional/codigos_promocionales`, `UsoPromocion/usos_promocion`, `Cancelacion/cancelaciones`, `EventoSaliente/eventos_salientes`; además sigue registrando `PublicacionReventa/publicaciones_reventa` y `TransaccionReventa/transacciones_reventa` heredadas |
| `catalogo` / Catálogo | `EventoReferencia/eventos_referencia`, `LocalidadEvento/localidades_evento`: copias de lectura separadas de las de Ventas |
| `postventa` / Postventa | `EventoReferencia/eventos_referencia`, `PublicacionReventa/publicaciones_reventa`, `TransaccionReventa/transacciones_reventa` |
| `acceso_qr` / Acceso QR | `EventoReferencia/eventos_referencia`, `QrEntrada/qr_entradas`, `Ingreso/ingresos`, `EventoSaliente/eventos_salientes` |
| `pagos` / Pagos | `TransaccionPago/transacciones_pago`, clave idempotente primaria, tipo, solicitante, monto/moneda, resultado, referencia, intentos |
| `eventos_emergencias` / Eventos-Emergencias | `Empleado/empleados`, `Turno/turnos`, `SolicitudCambioTurno/solicitudes_cambio_turno`, `RegistroAsistencia/registros_asistencia`, `Notificacion/notificaciones`, `ZonaEvento/zonas_evento` |
| `personal`, `parqueaderos` | Bases creadas por `infra/initdb/01-bases.sql`, sin aplicación ni esquema versionado de negocio |
| Redis | Revocaciones; locks/TTL de compra y reventa; fila/turnos; inventario Lua de pedidos (`pedidos:inv:{inventario}`) y reservas. No es un almacén descartable al consolidar |
| RabbitMQ | Colas durables, DLQ y mensajes pendientes; conservar topologías y evitar consumidores duplicados |

Las **18 migraciones** están en `services/<aplicacion>/src/persistencia/migraciones/`:

| Aplicación | Archivos, en orden |
|---|---|
| Autenticación (3) | `1789430400000-EsquemaInicialCu027.ts`; `1789516800000-AdministracionCuentasCu027b.ts`; `1789603200000-RenovacionSesiones.ts` |
| Alimentos (2) | `1789902006180-EsquemaInicialCu011.ts`; `1790000000000-ReservasInventarioCu011.ts` |
| Ventas (5) | `1789257600000-EsquemaInicialCu006.ts`; `1789344000000-SecuenciaNumeroTransaccion.ts`; `1789776000000-CarteleraCu005.ts`; `1789862400000-VentaPrimariaCu001a004.ts`; `1790553600000-BandejaSalida.ts` |
| Catálogo (1) | `1790208000000-EsquemaCatalogo.ts` |
| Postventa (1) | `1790035200000-EsquemaPostventa.ts` |
| Acceso QR (3) | `1790467200000-EsquemaAccesoQr.ts`; `1790553600000-QrEntradas.ts`; `1790553600001-BandejaSalida.ts` |
| Pagos (1) | `1790380800000-EsquemaPagos.ts` |
| Eventos/Emergencias (2) | `1789718400000-EsquemaInicialCu018.ts`; `1789750000000-Cu017PersonalOperativo.ts` |

Los `DataSource` de aplicación desactivan `synchronize` y la ejecución
automática de migraciones. La mayoría usa historial `migraciones`; Postventa
no fija ese nombre y usa el predeterminado del ORM. **Los Dockerfiles sí
ejecutan `migration:run` antes de arrancar** en las siete aplicaciones con
base distintas de Eventos/Emergencias. `iniciar.sh` también intenta migrarlas
desde el host. Esta duplicidad contradice sus comentarios y debe resolverse
antes de replicar procesos o reunir historiales.

Deudas de datos a mantener visibles:

- `ventas/src/persistencia/data-source.ts` conserva explícitamente la tabla
  histórica `ingresos` en la base antigua, aunque ya no registre la entidad.
  El comentario dice que los datos no se han copiado. También hay entidades
  de reventa antiguas además del esquema propio de Postventa. No eliminar ni
  unir esas tablas por coincidencia de nombres.
- `eventos_referencia`, estados enum, secuencias de transacción, `ingresos` y
  `eventos_salientes` se repiten con significados/columnas distintos. Los
  timestamps de outbox también se repiten entre historiales. Juntar todos
  los archivos en un único DataSource no constituye una migración válida.
- Ventas conserva transacción local de dueño+QR+historial; Postventa tiene
  índices parciales de publicación activa y no tiene FK a otra base.
  Acceso QR conserva `UNIQUE(entrada_id)` y transacción de aforo+ingreso.
  Preservar CHECK, índices, triggers de historial inmutable y secuencias;
  generar tablas desde entidades no reproduce todas esas garantías.
- Las semillas comparten UUID de usuarios entre dominios, rellenan las
  proyecciones y algunas truncan datos. Los volcados SQL solo cubren cuatro
  bases antiguas. Ninguno prueba una migración de datos reales a los paquetes
  nuevos ni una proyección inicial completa de QR/Postventa/Catálogo.

La consolidación de **procesos** conservará inicialmente las bases y conexiones
separadas con nombres explícitos para aislar riesgos. La consolidación de
**datos es parte del objetivo final**: una base `hexacore`, con esquemas por
módulo. Se realizará después, sobre una copia aislada, con reconciliación de
identificadores, dinero, QR, historiales y pendientes, drenaje de mensajes y
reservas, y reversión probada. No se ejecuta en esta reparación de configuración.

## 6. Integraciones, mensajes y trabajos programados

### Llamadas entre aplicaciones

| Origen → destino | Contrato actual que no debe desaparecer accidentalmente |
|---|---|
| Portales/móvil → gateway | Una URL pública; gateway → Autenticación, Ventas, Catálogo, Cola, Alimentos, Postventa, Acceso QR y Logística |
| Gateway → Cola | Consume turno antes de `POST /compras`; un fallo de Cola rechaza la compra |
| Ventas/Postventa/Alimentos → Pagos | Cobro y, donde aplica, reembolso; JWT del usuario; claves idempotentes; timeout distinto de rechazo |
| Postventa → Ventas | Consulta de entradas, retención, devolución y transferencia por `ClienteVentas`, compensaciones y credencial de servicio |
| Pagos → pasarela simulada | HTTP de cobro/reembolso con idempotencia y token de pago, sin datos completos de tarjeta |
| Pasarela → gateway → Pagos | Webhook HMAC, cuerpo original, confirmación/reintento |
| Notificaciones → correo simulado | HTTP; reintentos de errores transitorios y DLQ para errores definitivos |
| Acceso QR ↔ Ventas | **Eventos**, no RPC de validación: copia de QR hacia puerta e ingreso hacia Ventas |

### Topología observada

| Publicador | Exchange/clave o cola | Consumidor y alcance real |
|---|---|---|
| Autenticación | `cuentas.eventos` / `cuenta.correo`, evento `CORREO_PENDIENTE` | Notificaciones consume `cuentas.correos`; DLQ `cuentas.correos.dlq` mediante `cuentas.muertos` |
| Ventas | `ventas.eventos` / `compra.confirmada`, `compra.cancelada`, `entrada.actualizada` | `ventas.notificaciones` en Ventas (avisos en log); `acceso-qr.entradas` consume confirmación y actualización para su proyección. DLQ propias |
| Acceso QR | `acceso.eventos` / `ingreso.registrado`, `INGRESO_REGISTRADO` | Ventas consume `ventas.ingresos`, marca entrada USADA y alerta si estaba en reventa; DLQ vía `ventas.muertos` |
| Postventa | `reventa.eventos` / `entrada.transferida`, `ENTRADA_TRANSFERIDA` v1 | En Postventa: `reventa.notificaciones` y `reventa.liquidaciones`; DLQ por cola mediante `reventa.muertos`; efectos externos de notificación/abono todavía simulados |
| Alimentos | `pedidos.eventos` / `pedido.confirmado`, `PEDIDO_CONFIRMADO` en propiedad AMQP `type` | Declara `pedidos.establecimientos`; **no hay consumidor** implementado en esa topología. Recepción consulta PostgreSQL |
| Pagos | `pagos.eventos` / `pago.aprobado`, `pago.rechazado` | Publica desde webhook; **no hay consumidor de estos resultados en Ventas/Postventa/Alimentos**. La Saga pendiente no se completa por recibir el webhook |
| Logística | Cola directa `turnos.cambios`, DLQ `turnos.cambios.dlq`, prefijo configurable `PREFIJO_COLAS` | Publicador y consumidor en Eventos/Emergencias; escribe `notificaciones`, consultadas por HTTP |

RabbitMQ actual usa exchanges topic y colas durables; no se encontró la
configuración `x-queue-type: quorum` prevista por ADR-15; no es un requisito
nuevo impuesto por el plan de consolidación. `EventoPublicado`
y `EventoCancelado` aparecen como pendientes/comentarios, sin flujo productor
y consumidor implementado. Catálogo depende de sus datos sembrados.

Ventas y Acceso QR tienen outbox transaccional. Otros publicadores no obtienen
esa garantía por compartir broker: Pedidos publica después del commit sin
outbox/reenvío; Postventa y cuentas también requieren revisar la ventana
commit/publicación. El webhook de Pagos devuelve 503 si no puede publicar y
depende del reintento del proveedor; eso no demuestra recuperación ilimitada.
No activar a la vez consumidor antiguo y nuevo esperando que ambos reciban
cada mensaje: una misma cola reparte mensajes entre consumidores.

| Temporizador | Frecuencia y protección observada |
|---|---|
| Ventas `ExpiracionReservas` | Cron cada minuto (configurable `RESERVAS_CRON`), candado Redis `venta-expirar-reservas`, TTL 50 s |
| Postventa `ExpiracionService` | Cron cada 10 min (configurable `EXPIRACION_CRON`), candado `expirar-publicaciones`, TTL 60 s; también ruta manual |
| Alimentos `ExpiracionReservasService` | Sondeo cada 5 s; promesa `ciclo` evita solapamiento solo dentro del proceso. Usa bloqueos de filas e idempotencia Lua, pero no un candado de tarea compartido; medir ejecución concurrente antes de afirmar que admite réplicas |
| Outbox Ventas y Acceso QR | Cada 300 ms; lotes/bloqueo de filas `FOR UPDATE SKIP LOCKED`, con control de trabajo local. Entrega al menos una vez; conservar deduplicación y secuencia |
| Conexiones/consumidores | Reconexiones y resuscripciones con `setTimeout`; algunos consumidores reintentan cada 5 s. Preservar cierre de canales, timers y clientes al apagar el proceso |

## 7. Versiones y workspace común

No hay `package.json` de workspace en `App/`: los 10 servicios y los dos
portales tienen sus propios manifiestos/lockfiles v3. Se compararon las
dependencias raíz de cada lockfile con su `package.json`: **sin diferencias**.
Instalar esos lockfiles no exigió actualizarlos.

| Grupo | Versiones fijadas observadas y diferencia relevante |
|---|---|
| Ventas / Autenticación | Nest core 11.2.3 / 11.2.5; TypeORM 1.1.1, adaptador Nest/TypeORM 12.0.1, TS 5.9.3, amqplib 2.0.1 |
| Alimentos / Catálogo / Postventa / QR / Pagos | Nest core 11.2.8; TypeORM 1.1.2 y adaptador 12.0.2; TS 5.9.3; amqplib 2.2.0 donde se usa |
| Cola / Notificaciones | Nest core 11.2.8, TS 5.9.3, amqplib 2.2.0; sin ORM |
| Eventos/Emergencias | Nest 12.0.1, Config 12, Swagger 12; TS **6.0.3**; TypeORM 1.1.1/adaptador 12.0.1; Vitest **4.1.11**, `@types/supertest` 7.2.1 |
| Otros backends | Nest Config 4, Swagger 11; Jest 30/ts-jest 29.4; adaptador TypeORM 12 y Schedule 12 con paquetes ESM. Varias suites usan `--experimental-vm-modules` y dobles `moduleNameMapper` |
| Portales | Angular **19.2.25**, TypeScript **5.7.3**, Jasmine/Karma; no comparten compilador TS con backend |
| Móvil | SDK declarado Dart `^3.4.0`; CI fija Flutter **3.47.4**. Ejecutado Flutter **3.47.5**, Dart **3.13.4** |
| Runtime | CI y Dockerfiles usan Node 22; host ejecutó Node **25.2.1**, npm **11.6.3**. No es una ejecución idéntica al runner CI |

La instalación de Eventos/Emergencias emitió `EBADENGINE`: sus schematics y
Angular Devkit 22 requieren `^22.22.3 || ^24.15.0 || >=26.0.0`, que excluye
Node 25.2.1. El build pasó, pero no elimina la incompatibilidad declarada.
Una versión concreta de Node 22 compatible con todas las restricciones deberá
fijarse para la siguiente línea base.

Eventos/Emergencias usa `module/moduleResolution: nodenext`, imports `.js`,
metadatos de decoradores y ESM; los demás servicios usan CommonJS. Su `lint`
es **oxlint**, mientras el de los otros nueve es **`tsc --noEmit`**. Unificar
un comando `lint` no da la misma comprobación. Los peers de Nest 12 exigen
core/common 12; no hoistear versiones 11/12 como si fueran intercambiables.
Angular 19 y TS 5.7 deben conservar su frontera de compilación. Antes de un
lockfile único, decidir versiones, formato de módulos, aliases y herramientas
de pruebas; no resolverlo mediante actualizaciones masivas durante una mudanza.

## 8. Ejecución de la línea base inicial

Estos son los resultados del diagnóstico anterior. El seguimiento de §13
vuelve a comprobar el plan, el daemon y los Compose afectados. Docker ya está
disponible; las integraciones no ejecutadas siguen pendientes de ejecución,
no bloqueadas actualmente por un daemon apagado.

### Entorno y comandos auxiliares

Comandos iniciales: `git branch --show-current`, `git rev-parse HEAD`,
`git status --porcelain=v1 --branch`, `git log -1 --format=fuller`, búsqueda
con `rg --files --hidden`, lectura del plan mediante `cat` (falló: archivo
inexistente), lectura de instrucciones y fuentes citadas.

| Comprobación ejecutada | Resultado |
|---|---|
| `node --version`, `npm --version`, `python3 --version` | v25.2.1, 11.6.3, Python 3.14.0 |
| `docker --version`, `docker compose version` | Docker 29.7.2; Compose v5.3.1 |
| `docker info --format '{{.ServerVersion}}'` | Inicialmente bloqueado, exit 1 por socket inexistente. Seguimiento: permiso denegado dentro del sandbox; repetido con autorización fuera de él, **exit 0, ServerVersion 29.7.2** |
| `psql --version` | Cliente PostgreSQL 14.17; no acredita servidor. Compose pide PostgreSQL 16, Redis 7 y RabbitMQ 3.13 |
| `flutter --version` | Primer intento bloqueado por escritura de caché en `/opt/homebrew/share/flutter/bin/cache`; repetido con autorización fuera del sandbox: pasó, versión indicada en §7 |
| `npm ci --cache /private/tmp/hexacore-diagnostico-npm-cache --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` en Ventas | Primer intento bloqueado por red: log npm `ENOTFOUND registry.npmjs.org` y «Exit handler never called». Repetido fuera del sandbox: pasó |
| `npm ci` con esa caché y `--prefer-offline` | Pasó secuencialmente en los diez backends y ambos portales, sin cambios de lockfile. Avisos deprecados no se confundieron con fallo de instalación |
| Intento `npm ci --offline` en Catálogo | `ENOTCACHED` para `qs-6.17.0`; los comandos intentados antes de completar instalación devolvieron 127 (`tsc`, `jest`, `nest` ausentes). Tras instalación completa se repitieron y pasaron. Fallo de preparación, no de código |
| `flutter pub get` | Pasó fuera del sandbox; no se ejecutó upgrade ni cambiaron dependencias declaradas |
| `bash -n` | Pasó sobre 15 scripts: 12 de pruebas de servicios y 3 de infraestructura |
| `ast.parse` de Python | Pasó sobre 36 scripts de pruebas e infraestructura, sin ejecutarlos ni generar cachés |

Los intentos que requerían red/caché SDK/Chrome se repitieron o ejecutaron
fuera del sandbox con autorización. Las tareas de instalación, compilación y
pruebas se ejecutaron **secuencialmente**. Las pruebas unitarias usaron sus
dobles/fixtures; para Cola se fijó `REDIS_HOST=127.0.0.1 REDIS_PUERTO=16389`,
sin usar el Redis de desarrollo. No se definió
`REDIS_INVENTARIO_PRUEBAS_URL`, de modo que las suites de integración Redis
de Alimentos quedaron omitidas explícitamente.

### Backends

En cada directorio `App/services/<servicio>` se ejecutó `npm run lint`,
`npm test -- --runInBand`, `npm run build`. En Eventos/Emergencias se usó
`npm test` (Vitest) y se añadió `./node_modules/.bin/tsc --noEmit` porque su
lint no comprueba tipos. Un fallo no impidió ejecutar las demás comprobaciones.

| Aplicación | Lint | Tipos | Pruebas | Build |
|---|---|---|---|---|
| Ventas | Aprobado | Aprobado, incluido en lint | **189 aprobadas**, 15 suites | Aprobado |
| Postventa | Aprobado | Aprobado, incluido en lint | **175 aprobadas**, 14 suites | Aprobado |
| Acceso QR | Aprobado | Aprobado, incluido en lint | **25 aprobadas**, 2 suites | Aprobado |
| Catálogo | Aprobado | Aprobado, incluido en lint | **31 aprobadas**, 1 suite | Aprobado |
| Autenticación | Aprobado | Aprobado, incluido en lint | **43 aprobadas**, 3 suites | Aprobado |
| Alimentos | Aprobado | Aprobado, incluido en lint | **235 aprobadas, 33 omitidas**, 13 suites aprobadas y 2 omitidas (Redis) | Aprobado |
| Pagos | Aprobado | Aprobado, incluido en lint | **27 aprobadas**, 2 suites | Aprobado |
| Notificaciones | Aprobado | Aprobado, incluido en lint | **Fallida**, exit 1: `No tests found` | Aprobado |
| Cola virtual | Aprobado | Aprobado, incluido en lint | Jest informa **31 aprobadas**, pero **10 retornaron sin aserciones** por Redis no disponible. Contar estas 10 como omitidas efectivas; las otras 21 sí se ejecutaron | Aprobado |
| Eventos/Emergencias | Aprobado, oxlint | **Fallido**, exit 2: cinco errores detallados en §9 | Exit 0 **sin archivos de prueba**, `passWithNoTests: true`. Cero pruebas ejecutadas | Aprobado |

Los mensajes ERROR sobre Redis, pasarela o base caída dentro de pruebas con
dobles corresponden a escenarios de fallo esperados cuando su resumen final
es aprobado. No representan una caída del sistema real. Tampoco un build
aprobado valida migraciones SQL, consumidores reales o las garantías bajo carga.

### Interfaces

| Directorio | Comandos ejecutados | Resultado |
|---|---|---|
| `App/frontend/portal-web-admin` | `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`; `npm run build`; `npm test -- --watch=false --browsers=ChromeHeadless --progress=false` | Todos exit 0; **1 prueba aprobada** |
| `App/frontend/portal-web-cliente` | Los mismos tres comandos | Todos exit 0; **16 pruebas aprobadas**; build avisa de `qrcode` CommonJS |
| `App/frontend/app-movil` | `flutter analyze`; `flutter test test/` | Ambos exit 0; **sin problemas de análisis**, **50 pruebas aprobadas** |

Para Angular se fijaron `NG_CLI_ANALYTICS=false` y
`CHROME_BIN=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Chrome Headless observado: 157.0.0.0. No se generaron APK/IPA: CI tampoco los
requiere; los plugins nativos y la firma quedan fuera de esta línea base.

### Compose, E2E y comprobaciones bloqueadas/no ejecutadas

| Comando / comprobación | Resultado y clasificación |
|---|---|
| `docker compose -f App/infra/docker-compose.yml --profile servicios config -q` | **Aprobado**, exit 0, no necesita daemon |
| El anterior añadiendo `-f App/infra/docker-compose.escalado.yml` antes del perfil | **Aprobado**, exit 0; valida sintaxis/mezcla, no comportamiento de réplicas |
| El anterior añadiendo `-f App/infra/docker-compose.remoto.yml` | Diagnóstico inicial y reproducción previa a la reparación: exit 1, `service "nucleo" has neither an image nor a build context specified: invalid compose project`. **F05 reparado: ahora exit 0**; inspección semántica en §13 |
| El anterior añadiendo `-f App/infra/docker-compose.registro.yml` | Exit 0, **sintaxis aprobada, configuración funcional pendiente/fallida por inspección**: añade `nucleo`, conserva builds y elimina montaje de clave del gateway |
| `docker compose ... config --format json` de base/registro/escalado | Ejecutados e inspeccionados. Base 18 servicios; registro 19 por el `nucleo` residual; diez servicios conservan `build` (ocho backends + dos simuladores) |
| `npm run test:e2e` en Autenticación | **Fallido**, exit 1: no hay specs que coincidan; su carpeta `test` conserva configuración/README de Pedidos |
| `npm run test:e2e` en Alimentos | **Fallido**, exit 1: `Missing script: "test:e2e"`, aunque existe `test/cu011.e2e-spec.ts` |
| `npm run test:integracion` en Pagos | **Fallido**, exit 127: `bash: pruebas/correr-todas.sh: No such file or directory` |
| E2E real de Ventas | **No ejecutado, pendiente**. Docker ya está disponible; requiere preparar aislamiento y reparar su dependencia Pagos (§9). No contar como prueba fallida de negocio |
| E2E de Eventos/Emergencias | **No ejecutado, pendiente** sobre infraestructura aislada; no se invocó el prehook que crea/migra/trunca tablas |
| Suites HTTP `test:integracion` de Autenticación, Ventas, Postventa, QR, Catálogo, Cola y Alimentos | **No ejecutadas**: backend no levantado y varias suites resiembran/truncan datos o controlan contenedores actuales; primero necesitan infraestructura aislada |
| `docker build -t hexacore-gateway-ci App/gateway`, arranque integral y smoke de CD | **No ejecutados, pendientes**; el bloqueo previo de daemon queda retirado. No afirmar que `nginx -t`, carga de njs, JWT en gateway o imágenes publicadas fueron validados |
| `App/gateway/pruebas/gateway.py`, pruebas web login/reventa y Flutter `integration_test` | **No ejecutadas**, necesitan gateway/backend desplegados y, para móvil, dispositivo/simulador |
| Cobertura de integración, carga, disponibilidad, réplicas y `atributos-calidad.py` | **No ejecutadas**. El informe versionado del 28 oct es evidencia histórica, no un resultado repetido aquí. Su modo `--desplegabilidad` borra datos: no se usó |
| `iniciar.sh`, semillas, exportación/limpieza, `migracion:correr/revertir`, `docker compose down -v`, purgas Redis/RabbitMQ | **No ejecutados** sobre infraestructura actual. No se borraron volúmenes, bases ni mensajes |

### Reproducción sin confundir resultados

Los comandos salen de `package.json`, workflows, READMEs y scripts del
repositorio. Desde la raíz, tras instalar los lockfiles en cada paquete:

```bash
# Ejecutar en secuencia; registrar el exit code de CADA tarea aunque otra falle.
for servicio in ventas postventa acceso-qr catalogo autenticacion alimentos pagos notificaciones cola-virtual; do
  (
    cd "App/services/$servicio" || exit 1
    npm run lint
    env -u REDIS_INVENTARIO_PRUEBAS_URL REDIS_HOST=127.0.0.1 REDIS_PUERTO=16389 npm test -- --runInBand
    npm run build
  )
done

(
  cd App/services/eventos-emergencias || exit 1
  npm run lint
  ./node_modules/.bin/tsc --noEmit
  npm test
  npm run build
)
```

Para cada portal, ejecutar los tres comandos de la tabla anterior con Chrome
Headless disponible; después `flutter pub get`, `flutter analyze` y
`flutter test test/` en la app móvil. Los bucles anteriores **no son un gate
CI**: el último exit code no resume fallos anteriores; hay que registrar cada
comando como en las tablas de esta revisión.

Para pruebas reales futuras, levantar servicios desechables con puertos,
bases, Redis y vhost RabbitMQ exclusivos. Los Compose de pruebas existentes
reservan `entradas-e2e`/`entradas_e2e` (puertos 15434, 16381, 15674, 13100) y
`pedidos-e2e`/`pedidos_e2e` (15433, 16380, 15673, 13099), pero el segundo quedó
en Autenticación y ambos requieren corregir su cableado de Pagos. No usar
`iniciar.sh` para obtener aislamiento: fija nombres de contenedores, puertos y
semillas del ambiente normal. No trasladar comandos de limpieza de CI al
ambiente local.

## 9. Fallos previos y evidencia concreta

Son hallazgos del checkout antes de migrar; no se corrigieron en esta etapa.
Se distingue fallo reproducido de riesgo observado por lectura.

| ID | Evidencia | Consecuencia |
|---|---|---|
| F01, reproducido | `notificaciones`: `npm test -- --runInBand` → exit 1, `No tests found`; CI lo incluye en la matriz de backends | La línea base CI ya tiene un gate rojo; no atribuirlo a una futura consolidación |
| F02, reproducido | `eventos-emergencias`: `tsc --noEmit` → `test/personal-operativo.e2e-spec.ts:8` y `test/turnos-asistencia.e2e-spec.ts:9`, TS2307 `supertest/types`; en este último `:88` y `:1010`, TS2345 string frente a UUID template literal; `vitest.config.e2e.ts:19`, TS2769 opción `all` inexistente en `CoverageOptions` | Lint/build CI no cubren el programa completo de pruebas/configuración. Carga sobre TS 6 y tipos de supertest difiere del resto |
| F03, inspección + ejecución | `cola-virtual/src/cola/cola.redis.spec.ts`: 10 tests hacen `if (!hayRedis) return`; Jest salió 0 sin Redis | Verde que no acredita Lua, exclusión mutua, TTL ni aforo. Además limpia un evento con UUID fijo si encuentra Redis; siempre aislarlo |
| F04, reproducido | `eventos-emergencias/vitest.config.ts`: `passWithNoTests: true`; `npm test` → `No test files found, exiting with code 0` | No hay unitarias ejecutadas pese al verde; no sumarlas como aprobadas |
| F05, reproducido y **reparado en configuración** | Antes: Compose remoto referencia `nucleo`, inexistente en base, sin build/image. Después: override para diez backends, sin dependencias a datos locales, con Postventa → Pagos/Ventas y perfil `datos` separado | `config -q` e inspección de configuración resuelta pasan para remoto y remoto+escalado (§13). Arranque real e integración pendientes |
| F06, inspección de configuración resuelta | Compose registro añade `hexacore-nucleo`, no publicado por la matriz actual; deja build en ocho backends; gateway `volumes: !reset []` elimina también la clave pública que su Dockerfile no incorpora | `--registro` no representa el sistema íntegramente construido por CD; validación sintáctica exitosa no demuestra despliegue ni JWT operativo |
| F07, reproducido + inspección | E2E de Pedidos repartido entre `autenticacion/test` (configuración/Compose/README, sin specs) y `alimentos/test` (spec, sin script/config/Compose); script de integración de Pagos apunta a archivo inexistente | La caracterización real de pagos/pedidos no es ejecutable con los comandos anunciados |
| F08, inspección | E2E de Ventas levanta PostgreSQL/Redis/Rabbit/pasarela, pero no Pagos; `entorno-e2e.ts` fija `PASARELA_URL`, mientras el cliente actual usa `PAGOS_URL` con default `localhost:3008`. La configuración de Alimentos tampoco fija un Pagos aislado | Las suites ya no son autocontenidas tras la extracción de Pagos; pueden intentar hablar con un servicio ajeno o quedar con pago incierto. No ejecutarlas así |
| F09, inspección | `infra/iniciar.sh`: `migrar ... || true`, semillas con errores silenciados; rama SQL carga solo cuatro volcados. `autenticacion/src/persistencia/semillas` trunca usuarios. Dockerfiles también migran | Un mensaje final «en marcha» no demuestra esquema/datos completos. Un arranque normal puede reemplazar datos de desarrollo |
| F10, inspección | Sonda Eventos/Emergencias consulta `/api/v1/turnos`, pero controladores están bajo `/api/v1/logistica`; acepta cualquier 2xx/4xx. Compose declara `DB_SYNCHRONIZE=true`, código fija `false`; bootstrap lee `PORT`, Compose define `PUERTO` | La sonda puede aprobar un 404 y no acredita acceso a BD; la configuración contiene opciones inefectivas. El puerto actual coincide por default, no por esa variable |
| F11, inspección | Contrato `shared/api/ventas.openapi.json` sigue agregando cartelera, QR y reventa; `contrato-api.spec.ts` solo inspecciona ese JSON. `exportar-openapi.ts` crea únicamente el AppModule actual de Ventas | Las pruebas del JSON pasan sin demostrar paridad con los cuatro servicios. Regenerarlo sin diseñar agregación perdería operaciones externas |
| F12, inspección | Pagos publica `PAGO_APROBADO/PAGO_RECHAZADO`; no hay consumidor en dominios. Alimentos conserva resultado `FALLIDA` como pago incierto y bloquea nuevo cobro | Un webhook que resuelve el libro de Pagos no finaliza por sí mismo compra/pedido incierto. Pendiente de negocio previo; no implementarlo como parte de la mudanza |

## 10. Riesgos al reunir Entradas, Reventa, QR y Pagos

1. **Elegir por error la tabla de entradas o reventa antigua.** Ventas es dueño
   de la entrada; Postventa conserva publicaciones/transacciones en otra base;
   QR tiene estado independiente. Definir conexiones, propiedad y lectura
   explícitas antes de cambiar imports. No sustituir Sagas por repositorios
   directos en el mismo commit que mueve módulos.
2. **Perder la atomicidad de dueño/QR/historial y las defensas contra doble
   venta/ingreso.** Conservar UPDATE condicionado, candados Redis con testigo,
   índices únicos parciales, aforo y límites promocionales en BD. Repetir
   concurrencia real de reventa, compra, devolución y doble escaneo.
3. **Orden de QR y entrada USADA.** La proyección se alimenta por secuencia y
   no vuelve válida una entrada usada; `IngresoRegistrado` informa a Ventas.
   Quitar uno de los consumidores antes de retirar la proyección pierde esa
   información. Preservar cachés offline y resolución de conflictos. Medir la
   ventana entre publicación en reventa y llegada a puerta; agrupar procesos
   por sí solo no la elimina. Según el plan, esa proyección es transitoria:
   al consolidar los datos, transferencia e ingreso competirán sobre el mismo
   estado canónico en una transacción, y las copias se retirarán tras validarlo.
4. **Cobro duplicado o perdido al convertir Pagos en módulo.** Mantener libro
   durable, claves y referencias existentes, solicitante, monto/moneda y
   distinción APROBADO/RECHAZADO/INDETERMINADO. Hoy Pagos llama al proveedor
   antes de guardar resultado y su validación de clave compara tipo/monto/
   moneda, no todos los datos del solicitante. Revisar concurrencia y ámbito
   de las claves antes de instanciar el módulo en dos programas; una copia de
   código no puede producir dos autoridades de idempotencia.
5. **Perder el webhook al eliminar el servidor 3008.** Asignar un único
   receptor público compatible, conservar `rawBody` y HMAC, y entregar cada
   resultado a su dueño. La biblioteca no tiene servidor propio; eso no
   determina automáticamente quién monta el controlador. Documentar esa
   decisión antes del corte, sin construir ahora la Saga faltante.
6. **Cambiar estados al adaptar interfaces.** Alimentos traduce
   INDETERMINADO a `FALLIDA`, que significa pendiente de resolución; Ventas y
   Postventa usan otros estados. Unificar enums por nombre rompería reintentos,
   compensación, expiración o reembolsos. Conservar reglas de redondeo y dinero.
7. **Duplicar proveedores globales y trabajos de fondo.** Varios módulos
   globales exportan el mismo string `CONFIGURACION_SERVICIO`, además de
   conexiones TypeORM por defecto y tokens de infraestructura. Importarlos
   juntos puede inyectar configuración/base equivocada o iniciar consumidores
   y timers dos veces. Nombrar y delimitar proveedores explícitamente.
8. **Confundir eliminación de RPC con eliminación del contrato.** Primero
   reunir conservando interfaces y respuestas. Luego sustituir una llamada
   interna por invocación local detrás del mismo puerto de aplicación y medir
   equivalencia; no abrir `/interno/` mediante el gateway.
9. **Acoplar carga y fallos.** Compra, reventa y puerta compartirán proceso.
   Mantener límites de concurrencia/pool, aislamiento lógico y apagado
   ordenado; revalidar RNF de puerta y venta con carga. No afirmar que conserva
   rendimiento por pasar unitarias.

## 11. CI/CD y despliegue: alcance real

`ci.yml` usa Node 22, instala con `npm ci`, ejecuta lint/test/build en la matriz
de diez backends con Redis de CI. Eventos/Emergencias aparece **también** en el
job `logistica`, duplicando comprobaciones. Alimentos dispone de Redis para
sus suites en CI; aquí no se usó uno compartido. El job de integración levanta
`iniciar.sh`, prueba Autenticación/Ventas/Postventa/QR y E2E de Logística;
**no ejecuta integración de Alimentos ni una suite real del servidor Pagos**.
Los portales solo compilan en CI (esta revisión sí ejecutó sus tests). Flutter
corre análisis y `test/`. Gateway construye imagen para `nginx -t` y valida
solo Compose base. Los overrides remoto/registro no tienen esa protección.

Además, CI publica Redis en 6379 y solo define
`REDIS_INVENTARIO_PRUEBAS_URL`; la suite de Cola lee `REDIS_HOST/REDIS_PUERTO`
y por defecto usa 6380. Por tanto, el Redis provisto para Alimentos no habilita
por sí mismo las diez pruebas reales de Cola: también hay que corregir ese
cableado y quitar el falso verde descrito en F03.

`cd.yml` publica trece imágenes: diez backends, gateway y dos portales, para
amd64/arm64 en GHCR con rama y SHA. La matriz ya no publica Núcleo, pero el
override sí lo pide. El smoke comprueba primero `/salud` del gateway y luego
hace un `curl` sin fallo obligatorio al health de API; no recorre los CU ni
detecta por sí mismo datos faltantes. Es entrega de imágenes y prueba de
arranque, no despliegue continuo a producción.

Los workflows hacen `down -v` al terminar sus entornos efímeros. **No se
ejecutaron esos pasos aquí.** Al cambiar a cuatro programas habrá que ajustar
matrices, contextos Docker, registro, sondas, scripts, overrides, topologías y
documentación de modo coordinado, manteniendo un camino de reversión por
programa.

## 12. Etapas del plan y criterios de terminación

La secuencia siguiente corresponde a §10 del plan ya leído. La solicitud
actual autoriza únicamente reparar F05 y validar configuración; las demás
etapas conservan su condición de trabajo futuro. Ninguna consolidación de
procesos o datos se ejecuta en este cambio.

| Etapa del plan | Trabajo y situación | Criterio de terminación |
|---|---|---|
| 0. Base, inventario y decisión escrita | Rama y HEAD confirmados, inventario realizado y plan contrastado. El nuevo ADR y ajustes de SAD/SRS siguen pendientes | Punto de partida identificado, trabajo local conservado, decisión y límites registrados, inventario verificable sin equiparar pantallas y backend |
| 1. Base comprobable | **F05 reparado en configuración (§13)**. Pendientes Compose registro/F06, pruebas de Notificaciones, tipos de Logística, helpers y cableado E2E, junto con ejecución real aislada | Build y pruebas seleccionadas coherentes; arranque desde fuente e imágenes verificado; fallos previos y omisiones explícitos. Esta reparación sola no cierra la etapa |
| 2. Workspace y Núcleo existente | Fijar versiones compatibles y cuatro entradas; integrar identidad, alimentos y personal/turnos/asistencia en módulos del Núcleo. Conservar inicialmente conexiones/bases separadas | Contratos de cuentas, alimentos, cambios de turno y asistencia preservados; sin consumidores o timers duplicados. Sin fingir CU aún inexistentes |
| 3. Reunir Boletería | Integrar Ventas/Catálogo/Cola/Postventa/QR. Después de reunir procesos, reconciliar sobre copia los datos críticos de entrada/propiedad/reventa/ingreso, sustituir RPC y retirar copias solo tras validación | Flujos de CU-001–006; 50 compradores sobre una publicación, doble escaneo y carrera transferencia/ingreso; QR anterior inválido tras transferencia confirmada |
| 4. Pagos, trabajador y datos consolidados | Módulo común y único registro financiero, endpoint público único de webhook, resultado/trabajo durable y finalización idempotente. Migración repetible sobre copia a PostgreSQL `hexacore` por esquemas; drenar o migrar mensajes, reservas y pendientes | Identificadores/hashes/sesiones/estados/historiales/importes/QR/referencias conciliados y reversión probada. Reinicio entre pago/confirmación, callback duplicado/adelantado, proveedor lento, RabbitMQ caído y tareas repetidas sin doble cobro ni pérdida |
| 5. Operación mínima real | Monitoreo/incidentes/evacuación, contratos de lectura, protocolos, recepción/acuse y prioridad. Requiere alcance funcional posterior; no se implementa aquí | Activación con Núcleo detenido y sesión vigente bajo las dependencias declaradas; pruebas de fallo de instancia/proveedor y medición de tablero y entrega a dispositivos |
| 6. Funcionalidad pendiente | Completar por dependencias recintos/eventos/permisos, alimentos/entrega, parqueaderos/logística/proveedores y operación/finanzas/informes. No forma parte de esta reparación | Cada CU declarado completo tiene flujo real hasta persistencia y alternativas relevantes. La migración puede conservar y ubicar CU pendientes sin declararlos terminados |
| 7. Infraestructura, métricas y documentación | Adaptar gateway, Docker/Compose, scripts, CI/CD y vistas. Mantener perfiles local/replicación y controlar recursos compartidos | Cuatro programas de backend (tres de negocio y un trabajador), sin servidores retirados aún referenciados, sin dos autoridades de propietario/QR/pedido, despliegue y reversión verificados. RNF solo se certifican con su evidencia |

La meta de datos no queda satisfecha por reunir procesos: hace falta la
transferencia validada a una base por esquemas. La independencia de Operación
se refiere al **proceso Núcleo**, no a PostgreSQL/Redis/RabbitMQ/gateway/red.
Los pendientes de offline, permisos dinámicos inmediatos y recepción de
alertas no quedan resueltos por esta elección de despliegue.

### Primer cambio realizado y siguiente paso

El primer cambio de implementación es **F05, Compose remoto**, descrito y
verificado en §13. Su criterio de configuración está aprobado; el de arranque
real no se ejecutó. El siguiente trabajo permanece en la etapa 1 del plan:
reparar de forma separada las deudas de base comprobable (incluido Compose de
registro, F06) y ejecutar integración con datos aislados antes del workspace.

## 13. Reparación F05: configuración remota actual

Seguimiento del 1 de noviembre de 2026, misma rama y HEAD. Se volvió a leer
`docker-compose.yml`, `docker-compose.remoto.yml` e `iniciar.sh`, y se reprodujo
el error inicial de `nucleo` (exit 1) antes de editar. El cambio se limita a:

| Archivo | Cambio |
|---|---|
| `App/infra/docker-compose.remoto.yml` | Elimina `nucleo`; cubre los diez backends reales, retirando sus dependencias hacia datos/proveedores locales. Mantiene Postventa → Pagos/Ventas con `service_healthy`. Separa los cinco servicios de datos/proveedores bajo el perfil `datos` solo en este override, para que `--profile servicios` no los active incluso sin lista de servicios. Actualiza comentarios con las variables de `iniciar.sh` |
| `Documentation/Work/ESTADO-MIGRACION.md` | Retira los bloqueos resueltos, contrasta el plan completo, confirma la consolidación obligatoria de datos, alinea etapas y registra esta reparación y sus límites |

No se editaron el Compose base, el override de escalado ni `iniciar.sh`. Tampoco
se modificó el plan ni el archivo local de `App/services/pedidos`; se verificó
su conservación comparando SHA-256 antes/después, igual que los tres archivos
de infraestructura leídos pero no editados.

### Servicios y dependencias resueltos

Se inspeccionó `config --format json` y se comprobó con aserciones sobre el
JSON, usando la configuración base anterior como referencia. No se dedujo el
resultado únicamente del YAML o del exit code de `config -q`.

- **Remoto: 13 servicios activos**, exactamente los seleccionados por el rol
  `servicios` de `iniciar.sh`: `autenticacion`, `ventas`, `postventa`,
  `catalogo`, `notificaciones`, `alimentos`, `pagos`, `cola-virtual`,
  `acceso-qr`, `eventos-emergencias`, `api-gateway`, `portal-web-cliente` y
  `portal-web-admin`. No aparece `nucleo`.
- **Fuera del perfil remoto `servicios`:** `postgres`, `redis`, `rabbitmq`,
  `pasarela` y `correo`. Sus definiciones solo se habilitan si se activa
  explícitamente el perfil `datos`; ningún backend depende de ellas en el
  override. La máquina de datos sigue usando el Compose base sin este archivo,
  como hace `iniciar.sh --rol datos`.
- **Dependencias entre aplicaciones conservadas:** Postventa → Pagos/Ventas;
  gateway → Autenticación/Cola/Eventos-Emergencias/Ventas; ambos portales →
  gateway. Sus condiciones resueltas son idénticas a las del Compose base.
  No se añadieron dependencias funcionales nuevas como parte de este arreglo.
- Los otros nueve backends quedan sin `depends_on`: su infraestructura está
  en la máquina remota. Compose no puede comprobar la salud de ese destino
  mediante una dependencia local.
- Base y escalado conservan sus **18 servicios**. Se comparó el JSON base con
  una captura previa: idéntico. Escalado mantiene entornos y dependencias y
  quita los puertos fijos de Ventas/Autenticación/Alimentos como antes; se
  verificó lo mismo en la combinación remoto+escalado usada por `--replicas`.

### Destinos de conexión

Para comprobar interpolación se usó `192.0.2.10` como IP documental, **sin
conectarse a ella**, asignándola a los cinco `HOST_*` que exporta `iniciar.sh`.
Se fijó `PUERTO_REDIS=6380` como hace el script; los otros puertos se dejaron
en los defaults del Compose base. No se cambió el entorno persistente del
usuario ni se ejecutó el script de arranque.

| Destino | Resultado verificado en configuración resuelta |
|---|---|
| PostgreSQL | `POSTGRES_HOST=192.0.2.10`, `POSTGRES_PUERTO=5432` en el entorno común; nombres de bases y credenciales heredados del base sin cambios |
| Logística (nombres propios de variables) | `DB_HOST=192.0.2.10`, `DB_PORT=5432`, base `eventos_emergencias` |
| Redis | `REDIS_HOST=192.0.2.10`, `REDIS_PUERTO=6380` |
| RabbitMQ | `RABBITMQ_URL=amqp://hexacore:hexacore@192.0.2.10:5672` |
| Proveedor de correo | `CORREO_PROVEEDOR_URL=http://192.0.2.10:3098` en Autenticación y Notificaciones |
| Proveedor de pagos | `PAGOS_PROVEEDOR_URL=http://192.0.2.10:3099` en Pagos |
| API interna de Pagos | `PAGOS_URL=http://pagos:3008/api/v1` en Ventas, Postventa y Alimentos: permanece en la máquina de aplicaciones |
| API interna de Ventas | `VENTAS_URL=http://ventas:3001/api/v1` en Postventa: permanece en la máquina de aplicaciones |

Pasar `config -q` sin variables solo valida la estructura; para un arranque
remoto se necesitan los `HOST_*`/puertos exportados por `--datos`. No deben
usarse los defaults DNS de datos locales como si apuntaran a la otra máquina.

### Comandos ejecutados y resultados de este seguimiento

Todos los comandos siguientes son de lectura/configuración; no ejecutan
semillas, migraciones, limpieza ni creación de contenedores:

```bash
git status --porcelain=v1 --branch --untracked-files=all
git rev-parse HEAD
docker info --format '{{.ServerVersion}}'

docker compose -f App/infra/docker-compose.yml --profile servicios config -q
docker compose -f App/infra/docker-compose.yml -f App/infra/docker-compose.remoto.yml --profile servicios config -q
docker compose -f App/infra/docker-compose.yml -f App/infra/docker-compose.escalado.yml --profile servicios config -q
docker compose -f App/infra/docker-compose.yml -f App/infra/docker-compose.remoto.yml -f App/infra/docker-compose.escalado.yml --profile servicios config -q

bash -n App/infra/iniciar.sh
git diff --check
```

Los cuatro `config -q` se ejecutaron también como `config --format json` para
inspección. En las variantes remotas el proceso de comprobación recibió:

```bash
export HOST_POSTGRES=192.0.2.10 HOST_REDIS=192.0.2.10 HOST_RABBIT=192.0.2.10
export HOST_CORREO=192.0.2.10 HOST_PASARELA=192.0.2.10 PUERTO_REDIS=6380
```

Estas variables son un ejemplo reproducible de configuración, no un host de
prueba real. Las variantes locales se resolvieron sin esas variables de
interpolación. Un script temporal Python llamó a Compose y comprobó igualdad
de selección de servicios con `iniciar.sh`, ausencia de dependencias locales,
conservación de relaciones/condiciones entre aplicaciones, destinos y puertos,
y compatibilidad de escalado. Todas esas aserciones pasaron (exit 0).

| Comprobación | Resultado |
|---|---|
| Rama y HEAD | `feature/sebastian-arquitectura`, `2cd4fde22683d370dfe32991d983a0ae373b9908`, sin cambios |
| Plan | Leído completo y contrastado; archivo preservado |
| `docker info` | Intento dentro del sandbox: permiso denegado al socket. Repetición autorizada fuera del sandbox: exit 0, **29.7.2** |
| Compose remoto antes de editar | Exit 1, referencia residual `nucleo` |
| Compose base, remoto, escalado y remoto+escalado después de editar | **Todos exit 0**, tanto `config -q` como resolución JSON |
| Inspección semántica JSON | **Aprobada**: 18/13/18/13 servicios activos respectivamente; dependencias y conexiones comprobadas como arriba |
| `bash -n App/infra/iniciar.sh` | Exit 0; script sin cambios |
| Compilaciones y pruebas de interfaces | **No repetidas**, no afectadas por esta reparación |
| Arranque remoto, conectividad real, sondas de contenedores y flujos de negocio | **No ejecutados, pendientes**; no se presentan como integración aprobada |

Los JSON, comandos/exit codes y hashes auxiliares quedaron en
`/private/tmp/hexacore-compose-remoto/`. El éxito de la configuración no prueba
conectividad TCP, disponibilidad del host remoto ni retorno de webhooks.
En particular, la pasarela del Compose base usa
`http://api-gateway:8080/api/v1/pagos/webhook`: el retorno desde la máquina de
datos debe configurarse/verificarse en una prueba repartida; este cambio no
modifica ese Compose ni acredita ese flujo.

No se invocó `iniciar.sh`, `compose up/build/down`, migraciones, semillas ni
comandos de limpieza. Los Dockerfiles actuales pueden migrar durante el
arranque aun usando `--sin-demo`; por eso la validación se limitó a
configuración y dejó el arranque real para un entorno aislado.
