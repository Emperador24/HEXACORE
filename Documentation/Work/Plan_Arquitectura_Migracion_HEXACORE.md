# HEXACORE: arquitectura objetivo y plan de migración

Fecha de revisión: 1 de noviembre de 2026.

Base revisada: `Emperador24/HEXACORE`, rama `develop`, commit `2cd4fde22683d370dfe32991d983a0ae373b9908`. Su contenido incluye la integración de Samuel mediante el PR #43.

Estado de este documento: recomendación de arquitectura y secuencia de implementación. No es una afirmación de que la migración esté hecha o de que los requisitos de calidad ya estén demostrados. En esta revisión no se modificó el repositorio ni se ejecutó el sistema completo.

## 1. Decisión recomendada

Adoptar **un núcleo modular, dos aplicaciones especializadas y un trabajador de tareas**. Son cuatro tipos de programa de backend, mantenidos en un único espacio de trabajo NestJS:

| Programa | Responsabilidad | Casos de uso |
| --- | --- | --- |
| Núcleo | Identidad, eventos y recintos, alimentos, parqueaderos, personal y planificación logística, proveedores, administración financiera e informes | 23: CU-007–009, CU-011–018, CU-021–032 |
| Boletería | Consulta de cartelera, fila virtual, compra, promociones, cancelaciones, reventa y acceso con QR de entrada | 6: CU-001–006 |
| Operación | Monitoreo del evento, incidentes y evacuación | 3: CU-010, CU-019–020 |
| Trabajador | Entrega de notificaciones y ejecución de tareas pendientes, con prioridad reservada para alertas operativas | Soporte técnico de los anteriores; no agrega casos de uso |

**Pagos será un módulo reutilizable, sin un servidor HTTP exclusivo.** El núcleo y boletería usarán la misma implementación y el mismo registro financiero. El trabajador usará esa implementación para resolver operaciones pendientes.

Hay tres aplicaciones de negocio, de las cuales una contiene la mayor parte del sistema como monolito modular. El trabajador ejecuta tareas de esas aplicaciones. Un módulo interno no es otro servicio ni necesita otro contenedor.

Una réplica es otra copia del mismo programa: dos instancias de Boletería no representan dos nuevos servicios de negocio. Gateway, PostgreSQL, Redis, RabbitMQ y servidores de los portales se cuentan aparte como infraestructura e interfaces; cuatro programas de backend no significa cuatro contenedores totales.

### Por qué estas separaciones

- **Boletería:** RNF-10 pide aumentar sus instancias sin aumentar las del resto. Reunir ventas, catálogo, fila, reventa y acceso permite conservar esa capacidad y elimina varias coordinaciones de red.
- **Operación:** el SAD añade expresamente que la evacuación debe poder activarse aunque el núcleo no responda. Se conserva ese aislamiento de proceso para tres casos concretos; no es necesario sacar también personal y turnos.
- **Trabajador:** un envío lento o un trabajo pendiente no debe retener la petición del usuario. Esta es una separación técnica.
- **El resto permanece en el núcleo:** no encontré evidencia suficiente para exigir despliegues individuales de cuentas, alimentos, parqueaderos, proveedores, administración o planificación.

Un backend único para los 32 casos sería todavía más sencillo de desplegar, pero exigiría revisar RNF-10 y la independencia de emergencias planteada en el SAD. Esta propuesta conserva ambos objetivos sin regresar a catorce aplicaciones.

## 2. Qué hace el proyecto cuando todos sus casos estén terminados

HEXACORE cubre el ciclo de un evento: preparar recinto, capacidades, precios y recursos; publicar y vender entradas; reservar parqueadero y pedir alimentos; organizar personal y turnos; controlar accesos y entregas; monitorear operación, incidentes y evacuaciones; y conciliar dinero y producir informes.

La complejidad principal está en unas pocas reglas compartidas:

1. Un recurso limitado no se puede entregar dos veces: entrada, cupo, espacio de parqueadero, inventario o pedido.
2. Un movimiento de dinero puede quedar incierto cuando hay un corte de red.
3. Reventa e ingreso deben decidir sobre la misma entrada vigente.
4. Personal, recintos y proveedores no deben quedar asignados a horarios incompatibles.
5. Los tableros necesitan datos con origen y antigüedad conocidos.
6. Una alerta debe llegar y registrarse; haberla puesto en una cola no demuestra su recepción.

No desaparecen estas reglas al cambiar de arquitectura. Sí desaparecen muchas llamadas HTTP, copias de datos y mensajes usados solamente para conectar funciones del mismo sistema.

## 3. Diferencias frente al repositorio actual y a la propuesta anterior

La documentación de ADR-14 plantea siete microservicios y siete servicios de dominio. El Compose revisado ejecuta diez aplicaciones de backend: autenticación, alimentos, notificaciones, ventas, catálogo, cola virtual, acceso QR, postventa, pagos y eventos/emergencias. El objetivo documentado y lo implementado no coinciden completamente.

| Aspecto | Situación revisada | Arquitectura recomendada |
| --- | --- | --- |
| Backend | 10 programas implementados; 14 previstos en ADR-14 | 4 tipos de programa: núcleo, boletería, operación y trabajador |
| Monolito central | No hay uno que reúna la mayor parte del negocio | Núcleo modular con 23 de 32 CU |
| Entradas | Ventas, catálogo, fila, acceso y postventa separados | Una aplicación, con módulos internos y un estado canónico de entrada |
| Personal y turnos | Código en eventos/emergencias y otro dominio personal proyectado | Una implementación dentro del núcleo |
| Pagos | Servidor propio más clientes HTTP | Módulo común con adaptador de pasarela y un registro financiero |
| Datos | Varias bases lógicas sobre un servidor PostgreSQL | Una base lógica, organizada por esquemas y propiedad de módulo |
| Integración interna | HTTP, mensajes y proyecciones entre componentes del negocio | Llamadas locales a APIs de módulos; mensajes para trabajo diferido y efectos externos |
| Versiones del backend | Manifiestos y configuraciones por servicio | Un espacio de trabajo con dependencias compatibles y compilaciones por programa |
| Despliegue | Granularidad fina prevista | Versiones y migraciones coordinadas; no se busca independencia total |

También reduce mi propuesta previa de cinco programas: desaparece Pagos como servidor y personal/logística vuelve al núcleo. Operación se limita a monitoreo, incidentes y evacuación.

Esto no consiste en restaurar ADR-12 ni en deshacer el trabajo de Samuel. Se aprovechan sus guardas, contratos, manejo de sesión, pagos, pruebas y mecanismos de publicación que resulten válidos. Se cambia dónde se ejecutan y cómo se comunican.

## 4. Distribución completa de los casos de uso

Los estados de la última columna describen lo observado en documentación, controladores, código representativo y pruebas disponibles. “Base presente” no certifica un caso completo ni todos sus flujos alternativos.

| CU | Función | Destino | Situación observada |
| --- | --- | --- | --- |
| 001 | Comprar entradas | Boletería | Base presente en ventas; revisar pago incierto y confirmación |
| 002 | Validar ingreso por QR | Boletería | Base presente en acceso-qr; reunificar estado con reventa |
| 003 | Cancelar y reembolsar entradas | Boletería | Base presente; verificar políticas, parciales y reintentos |
| 004 | Aplicar promociones | Boletería | Base presente; verificar uso concurrente y cálculo en servidor |
| 005 | Consultar eventos | Boletería | Catálogo presente; conectarlo a eventos administrables |
| 006 | Revender entradas | Boletería | Base importante en postventa; verificar transferencia, ingreso concurrente y liquidación al vendedor |
| 007 | Administrar personal | Núcleo: personal/logística | Reutilizar personal operativo existente; cubrir el alcance restante |
| 008 | Gestionar cambios de turno | Núcleo: personal/logística | Reutilizar solicitudes y revisión existentes, sin duplicar CU-018 |
| 009 | Registrar asistencia | Núcleo: personal/logística | Reutilizar asistencia existente; verificar horarios y sincronización |
| 010 | Gestionar evacuaciones | Operación | No encontré un backend de evacuación entre los controladores actuales |
| 011 | Comprar alimentos | Núcleo: alimentos | Compra, reservas y pago presentes; faltan verificaciones de alternativas y recuperación |
| 012 | Administrar menú e inventario | Núcleo: alimentos | Hay consulta y activar/desactivar; el CRUD completo no está cubierto |
| 013 | Preparar y entregar pedidos | Núcleo: alimentos | Recepción/listado presentes; falta completar cambios de estado |
| 014 | Validar QR de entrega | Núcleo: alimentos | Hay generación de QR; falta completar entrega validada y única |
| 015 | Administrar establecimientos | Núcleo: alimentos | Catálogo y datos iniciales; falta gestión completa |
| 016 | Planificar logística | Núcleo: personal/logística | Backend completo no identificado |
| 017 | Asignar personal operativo | Núcleo: personal/logística | Base implementada en eventos-emergencias |
| 018 | Gestionar turnos y asistencia | Núcleo: personal/logística | Base implementada y pruebas de integración disponibles |
| 019 | Monitorear operación | Operación | No encontré un controlador de monitoreo operativo completo |
| 020 | Gestionar incidentes | Operación | Backend completo no identificado |
| 021 | Reservar parqueadero | Núcleo: parqueaderos | Directorio sin backend; hay simulación de interfaz |
| 022 | Registrar ingreso/salida vehicular | Núcleo: parqueaderos | Backend pendiente |
| 023 | Asignar espacios | Núcleo: parqueaderos | Backend pendiente |
| 024 | Calcular cobro de parqueadero | Núcleo: parqueaderos | Backend pendiente; el CU no pide integrar el cobro presencial |
| 025 | Controlar ocupación del parqueadero | Núcleo: parqueaderos | Backend pendiente |
| 026 | Administrar eventos | Núcleo: eventos/recintos | Existen referencias y datos iniciales; portal administrativo usa datos en memoria |
| 027 | Gestionar cuentas y sesiones | Núcleo: identidad | Base importante implementada |
| 028 | Gestionar roles y permisos | Núcleo: identidad | Hay roles/guardas; falta la administración dinámica completa descrita |
| 029 | Administrar recintos y zonas | Núcleo: eventos/recintos | Backend completo no identificado |
| 030 | Administrar proveedores | Núcleo: personal/logística | Backend completo no identificado |
| 031 | Administrar y conciliar finanzas | Núcleo: finanzas/informes | Hay registro de pagos y reembolsos; no equivale a conciliación administrativa completa |
| 032 | Consultar y exportar informes | Núcleo: finanzas/informes | Backend completo no identificado |

Personal, turnos y asistencia aparecen en CU-007–009 y CU-017–018: deben compartir entidades y reglas. CU-013 y CU-014 también comparten la misma entrega de pedido. No deben surgir sistemas paralelos por seguir literalmente los encabezados del documento.

Hay referencias cruzadas y numeraciones inconsistentes en algunos flujos de alimentos. Conviene corregirlas en la documentación antes de usarlas para generar tareas automáticamente.

### El papel de Sebastián

El reparto formal conserva tus ocho CU: **011, 012, 013, 014, 015, 027, 028 y 029**. Todos quedarían dentro del núcleo.

Tu trabajo funcional reúne alimentos, cuentas/permisos y recintos. La migración arquitectónica es una responsabilidad adicional que estás asumiendo; no convierte automáticamente en tuyos los casos pendientes de los demás.

Esto permite que después de la migración trabajes en un programa central, con módulos separados, sin mantener autenticación y alimentos como servidores distintos.

### Comportamiento esperado al completar los módulos

| Módulo | Qué debe resolver dentro de su frontera |
| --- | --- |
| Eventos/recintos | Borrador, publicación y cancelación; fechas compatibles con el recinto; zonas y capacidad coherentes; configuración de localidades y precios. Una reducción de capacidad no puede ignorar entradas ya vendidas. Cancelar un evento bloquea nuevas ventas y deja registradas las devoluciones que procedan, procesadas con seguimiento. |
| Entradas | Disponibilidad y precio calculados por servidor, reservas con plazo, promoción aplicable, compra y QR vigente. La reventa incluye liquidación o saldo pendiente del vendedor según la integración elegida, con registro financiero; transferir la propiedad no agota el CU-006. |
| Alimentos | CRUD de establecimientos y productos, horarios, disponibilidad y restricciones; reserva de existencias y pago; pedido CONFIRMADO → EN_PREPARACIÓN → LISTO → ENTREGADO. Las cancelaciones autorizadas, faltantes y reembolsos tienen transiciones explícitas; no se resuelven borrando el pedido. |
| Parqueaderos | Diferenciar reserva, espacio asignado, visita activa y espacio liberado. Atender vehículos sin reserva sin ocupar cupos comprometidos. Calcular cobro con tarifa y horas registradas y alimentar el tablero con ingresos y salidas reales. |
| Personal/logística | Una sola ficha de empleado, asignaciones aceptadas o rechazadas, cambios de turno revisados, asistencia e historial; cobertura por zona, disponibilidad de recursos/proveedores y presupuesto del plan. Evitar choques de horario y desactivación de recursos con compromisos sin resolver. |
| Operación | Monitoreo con fuentes conocidas; incidentes con prioridad, responsable y seguimiento; evacuación sobre rutas configuradas, confirmación del supervisor, instrucciones, acuses, alternativas y cierre auditado. |
| Identidad y finanzas | Recuperación y verificación de cuentas, permisos administrables y alcance por recurso; movimientos conciliados con el proveedor, diferencias visibles, reembolsos autorizados y auditoría. Los informes reúnen la información sin duplicar sus reglas de origen. |

En este diseño, completar una de estas funciones agrega lógica a un módulo existente; no agrega automáticamente un programa que el equipo deba desplegar.

## 5. Organización del código

Mantener NestJS, TypeScript, PostgreSQL, Redis, RabbitMQ, Nginx, Angular y Flutter que ya usa el proyecto. No incorporar otra plataforma para realizar esta consolidación.

Propuesta de carpetas, como objetivo y no como estructura ya existente:

- `App/backend/apps/nucleo`: arranque y rutas del núcleo.
- `App/backend/apps/boleteria`: arranque y rutas de entradas.
- `App/backend/apps/operacion`: arranque y rutas operativas.
- `App/backend/apps/tareas`: arranque de consumidores y trabajos.
- `App/backend/modulos/identidad`.
- `App/backend/modulos/eventos-recintos`.
- `App/backend/modulos/entradas`, con catálogo, fila, compra, promociones, reventa e ingreso como partes internas.
- `App/backend/modulos/alimentos`.
- `App/backend/modulos/parqueaderos`.
- `App/backend/modulos/personal-logistica`.
- `App/backend/modulos/operacion`.
- `App/backend/modulos/finanzas`, con pagos y conciliación.
- `App/backend/modulos/informes`.
- `App/backend/modulos/comunicaciones`, para notificaciones.
- `App/backend/compartido`: configuración, seguridad, errores y utilidades técnicas pequeñas.

El espacio de trabajo tendrá un manifiesto y un archivo de dependencias resueltas para el backend. Cada programa carga los módulos que necesita. Una biblioteca no se levanta como otro servidor.

Los servicios internos de un módulo pueden usarse desde un coordinador o tarea sin copiar su código ni publicar otro endpoint HTTP. Por ejemplo, la cancelación de un evento coordina las reglas del módulo Entradas y las de Pagos mediante interfaces internas explícitas.

Reglas de sencillez:

1. Un controlador recibe y valida; un servicio aplica el caso de uso; persistencia guarda.
2. Un módulo expone una API pequeña. Otro módulo no importa sus repositorios o entidades internas para modificarlas.
3. No crear capas vacías ni una interfaz por cada función. El adaptador de pasarela o notificaciones sí justifica una interfaz porque sustituye un proveedor externo.
4. No hay un servicio de QR genérico que decida reglas de todos los dominios: entrada, pedido y parqueadero tienen validaciones diferentes.
5. No usar RabbitMQ para llamar a otra función dentro del mismo proceso.
6. No crear un servidor por caso de uso, rol o tabla.
7. Comprobar automáticamente los límites de importación y los flujos importantes; no introducir una plataforma nueva solo para esa comprobación.

La documentación oficial de NestJS admite aplicaciones y bibliotecas en un mismo workspace. La implementación debe adaptarse a las versiones compatibles que se elijan para este repositorio, sin copiar ciegamente la configuración de la última documentación.

## 6. Datos: una fuente clara por información

Objetivo: **una base PostgreSQL `hexacore`, con esquemas por módulo**. Los nombres de esquema definitivos se fijan al escribir las migraciones.

| Datos | Propietario de las reglas |
| --- | --- |
| Cuentas, sesiones, roles y permisos | Identidad |
| Eventos, recintos, zonas y capacidades configuradas | Eventos/recintos |
| Inventario de entradas, compras, propietarios, QR vigentes, reventas e ingresos | Entradas |
| Establecimientos, productos, reservas y pedidos | Alimentos |
| Espacios, reservas, visitas, tarifas y ocupación vehicular | Parqueaderos |
| Personal, turnos, asistencia, planes y proveedores | Personal/logística |
| Incidentes, activaciones de evacuación y seguimiento operativo | Operación |
| Intentos de cobro, resultados, reembolsos, conciliación y auditoría financiera | Finanzas/pagos |
| Tareas de entrega, intentos y acuses | Comunicaciones |

Los esquemas son divisiones de tablas dentro de una misma base, no nuevos servidores.

Cada módulo modifica sus datos mediante su API pública. Los paneles e informes pueden consumir vistas de lectura publicadas y mantenidas por el módulo propietario; no deben conocer libremente sus tablas internas. Los contratos de lectura también deben versionarse cuando cambien.

Esta elección acepta coordinación de versiones y migraciones. **No pretende mantener la independencia de base de datos propia de cada microservicio.** Esa concesión reduce copias y permite transacciones locales en operaciones que hoy cruzan bases.

La separación física nunca ha estado completa: el Compose actual ya usa un servidor PostgreSQL compartido. Ni esa situación ni la propuesta garantizan continuidad si se pierde el servidor de datos.

### Operación sin depender del proceso Núcleo

Operación consulta el contexto operativo mediante interfaces de lectura de datos y mantiene disponibles los protocolos configurados del evento. No hace una llamada obligatoria a la API del núcleo para cada monitoreo o evacuación.

Verifica sesiones válidas y permisos con los mecanismos locales y de revocación compartidos; no llama al login en cada petición. La emisión y renovación de sesiones sigue siendo responsabilidad de Identidad.

El trabajador que entrega alertas tampoco depende de que el proceso Núcleo esté vivo. Esto permite probar la activación de una evacuación con el núcleo detenido y una sesión vigente.

Se conserva aislamiento respecto del fallo del proceso Núcleo. PostgreSQL, Redis, RabbitMQ, el gateway, la red y los proveedores siguen siendo dependencias que deben declararse y probarse. “Operación separada” no significa “ningún fallo la afecta”.

## 7. Dinero, concurrencia y tareas

### Compra y pago

1. Calcular precios en el servidor y registrar reserva e intento de pago con identificador estable.
2. Confirmar ese registro antes de contactar al proveedor.
3. Llamar a la pasarela fuera de una transacción SQL larga, siempre con la misma clave de idempotencia para el mismo intento.
4. Persistir el resultado y aplicar la transición del negocio de forma transaccional cuando ya se conoce.
5. Si no se sabe qué ocurrió, conservar un estado PENDIENTE/INDETERMINADO. Resolver por webhook verificado, consulta al proveedor o conciliación.
6. Si el pago quedó confirmado y el negocio no puede completarse, registrar y ejecutar la compensación correspondiente, sin inventar un rechazo.

No se logra una transacción atómica con la pasarela externa por reunir las tablas. Se necesita ese protocolo explícito.

Una consulta previa de idempotencia seguida de cobro no resuelve por sí sola dos solicitudes simultáneas. Hay que reservar la clave de operación en la base y usar también la idempotencia del proveedor.

Un timeout no debe provocar automáticamente un nuevo cobro, ni liberar un recurso como si se supiera que el cobro fracasó. Los pendientes necesitan vencimiento controlado, consulta, eventual anulación/reembolso y visibilidad administrativa.

Conservar firma HMAC de callbacks, validación de importe, moneda y tipo, relación con la operación original y auditoría. Un callback duplicado o fuera de orden no puede volver a entregar, cobrar ni reembolsar.

El CU-024 únicamente calcula el importe al salir del parqueadero, redondeado por horas según la tarifa, o muestra que estaba prepagado. El cobro presencial se describe fuera del sistema. El pago electrónico de la reserva corresponde al CU-021.

### Reventa e ingreso

Reunificar en el dominio Entradas la propiedad, vigencia de QR, publicación y uso de la entrada.

Ingreso y transferencia deben competir sobre el mismo estado transaccional: si una entrada ya fue usada, no se transfiere; si la transferencia ya quedó confirmada, el QR antiguo se rechaza. No basar esta decisión en una copia actualizada más tarde por mensajes.

En una transferencia confirmada se actualizan propietario, versión de QR e historial en la misma transacción, y el nuevo QR se entrega después de confirmar. Si ya se cobró y un conflicto impide completar la venta, queda una compensación auditable.

### Otros recursos limitados

- Producto: reservar y descontar sin vender más inventario del disponible.
- Pedido: validación y paso a ENTREGADO en una operación indivisible; dos lectores no pueden entregar dos veces.
- Parqueadero: reserva y asignación concurrente con restricciones y bloqueos de base, incluyendo ingreso sin reserva.
- Personal, proveedor y recinto: comprobar solapamientos dentro de la operación que confirma la asignación.
- Cupón: uso y límite total protegidos ante concurrencia.

Redis conserva las funciones ya útiles, como fila y reservas temporales. Los saldos y estados definitivos deben tener una autoridad explícita y recuperable. La pérdida de una clave de caché no puede significar automáticamente que un recurso vendido vuelva a estar disponible.

### Mensajería y trabajos

Mantener RabbitMQ para trabajo diferido y entrega a proveedores. Registrar en una bandeja de salida persistente, junto con la transacción de negocio, aquello que deba publicarse después. Los consumidores deben tolerar mensajes repetidos.

Una bandeja de salida es una tabla de tareas pendientes de publicación; no necesita convertirse en un nuevo producto interno con muchas capas.

El trabajador atiende notificaciones, reintentos, conciliaciones programadas, vencimientos y exportaciones que lo requieran. Los trabajos se reclaman de forma segura entre réplicas; un booleano en memoria o un temporizador por API no evita dos ejecuciones.

Reservar capacidad para alertas. Si informes o envíos normales afectan el tiempo de entrega, ejecutar otra instancia del mismo trabajador dedicada a la cola de alertas. Las tareas de CPU intensiva no deben compartir el bucle que atiende la entrega urgente. El código sigue siendo uno; las instancias no agregan dominios.

## 8. Límites funcionales que hay que definir con honestidad

### Conectividad intermitente

El repositorio pide operación offline en accesos, asistencia y parqueaderos. Dos lectores desconectados no pueden garantizar al mismo tiempo conocimiento global instantáneo, cero reutilización y aceptación de cambios recientes de reventa.

Definir un protocolo explícito: qué puede autorizarse sin conexión, qué se captura como pendiente, cómo se reconcilia y qué garantía se ofrece. Hasta resolverlo, no presentar la admisión offline como si ofreciera las mismas garantías que la validación online.

La arquitectura no soluciona esa contradicción por agregar servicios. El diseño propuesto facilita las garantías online; el alcance offline necesita una decisión de negocio registrada.

### Aforo y evacuación

Entradas vendidas, ingresos acumulados, personas presentes y ocupación por zona son medidas distintas. Si no se registran salidas o movimientos entre zonas, el sistema no sabe automáticamente la ocupación física exacta.

Cada indicador debe especificar su fuente y mostrar la hora de última actualización. Los datos simulados y las confirmaciones manuales deben identificarse como tales.

CU-010 puede partir de zonas, salidas y rutas previamente configuradas, selección del supervisor, instrucciones y seguimiento. No exige inventar un optimizador de rutas, una red de sensores o un sistema de inteligencia artificial.

RNF-17 se verifica con recepción en los dispositivos. La aceptación por RabbitMQ o un correo enviado no demuestra ese resultado. La app necesita canal de alerta y acuse; si debe recibir con la app en segundo plano, hace falta el adaptador de notificaciones push correspondiente.

### Autorización

CU-028 pide permisos dinámicos e impacto inmediato. Un rol metido en un JWT que dura varios minutos no satisface por sí solo esa regla. Se necesita revocación o versión de permisos y probar la reacción al cambio.

Tener rol Personal no autoriza a modificar cualquier restaurante o cualquier evento. Verificar también pertenencia al establecimiento, asignación y alcance del usuario.

### Informes y archivos

Usar consultas de lectura, índices, paginación y exportaciones diferidas cuando sea necesario. No añadir un almacén analítico solo porque exista CU-032.

Mapas de recintos y adjuntos de proveedores pueden comenzar con almacenamiento persistente sencillo y un adaptador acotado. No convertir esas funciones en una migración adicional de plataforma.

## 9. Compatibilidad con los requisitos

| Requisito | Tratamiento |
| --- | --- |
| RNF-01/02: reventa única y QR anterior inválido | Estado de entrada y transacciones compartidos; pruebas de carreras con ingreso |
| RNF-03/04: continuidad y recuperación | Perfil con réplicas y comprobación de salud; medir caída de instancia y recuperación ≤30 s |
| RNF-05/06: seguridad | No guardar tarjetas; token de pasarela, guardas locales, revocación y autorización por recurso |
| RNF-07: p95 ≤500 ms con 2.000 usuarios | Conservar Boletería separada; medir con la carga exigida |
| RNF-08: QR p95 ≤300 ms | Camino de validación corto, índices y sin llamada a Núcleo o Pagos |
| RNF-09: tablero ≤2 s | Lecturas operativas eficientes y canal de actualización medido extremo a extremo |
| RNF-10: 1,7× al duplicar instancias | Escalar Boletería por separado y medir también latencia del núcleo y operación |
| RNF-11: auditoría financiera | Registro canónico de movimientos y trazabilidad de intentos/compensaciones |
| RNF-12/14: usabilidad y web/móvil | Preservar contratos y probar flujos completos en ambas interfaces |
| RNF-13: mantenibilidad | Reformular oficialmente para módulos; se acepta despliegue coordinado |
| RNF-15: despliegue sin fallos | Cambio de tráfico entre versiones listas y migraciones compatibles; no basta reiniciar un contenedor |
| RNF-16: proveedor de pagos sustituible | Cambiar un adaptador sin cambiar reglas de compra; puede requerir recompilar los programas que lo incluyen |
| RNF-17: alertas ≥99% en ≤10 s | Operación separada, entrega prioritaria, acuses y pruebas con fallos |
| RNF-18: pruebas aisladas | Módulos comprobables con dobles; conservar cobertura de lógica ≥70% y pruebas reales de integración |

RNF-13 actual cuenta microservicios modificados y redesplegados. No debe marcarse como satisfecho con un cambio de nombre: hay que registrar que se cambia por “un módulo de negocio modificado, manteniendo contratos ajenos estables”, y que puede haber despliegues coordinados de los programas que comparten ese módulo.

La restricción del SAD que impone microservicios con base independiente nace de una decisión anterior del equipo. También debe actualizarse, junto con el criterio de independencia de información del SRS, al adoptar esquemas y APIs públicas de módulo. No dejar documentos que exijan una arquitectura mientras el código implementa otra.

El informe de atributos disponible usa una prueba de 200 usuarios concurrentes. Ese resultado no demuestra el requisito de 2.000. Una prueba breve de caída tampoco demuestra por sí sola 99,9% mensual.

## 10. Migración por etapas

No mezclar en un solo cambio la reorganización, la unificación de datos y la implementación de todos los casos pendientes.

### Etapa 0: base, inventario y decisión escrita

- Crear `feature/sebastian-arquitectura` desde `origin/develop` actualizado.
- Revisar primero el estado del equipo local: no perder modificaciones no subidas.
- La rama remota `feature/sebastian` revisada, en `3780537`, es antecesora de este `develop`; la comparación mostró 35 commits adicionales en develop y ninguno exclusivo de esa rama remota.
- Guardar una etiqueta o referencia del punto de partida.
- Inventariar rutas, tablas, migraciones, colas, trabajos, contratos y pruebas. Registrar explícitamente qué funciona y qué todavía es simulación.
- Escribir el nuevo ADR y ajustar objetivo, límites y métricas documentales.

Secuencia orientativa, después de comprobar que no hay trabajo local pendiente:

```bash
git status --short --branch
git fetch origin
git switch -c feature/sebastian-arquitectura origin/develop
git push -u origin feature/sebastian-arquitectura
```

Esos comandos no se ejecutaron en el computador del usuario durante esta revisión. Si la rama ya existe, no recrearla ni forzarla.

### Etapa 1: conseguir una base comprobable

Las ejecuciones revisadas muestran fallos en integración de autenticación, pruebas de notificaciones y arranque de imágenes publicadas. Corregirlos y distinguir problemas de prueba de problemas del negocio.

- Revisar helpers que todavía apuntan a ubicaciones anteriores de reventa.
- Corregir el tratamiento explícito de un módulo sin pruebas; no presentarlo como cobertura conseguida.
- Actualizar Compose de imágenes publicadas que conserva referencias antiguas.
- Asegurar que los escenarios existentes se ejecutan y no quedan omitidos.
- Conservar resultados reproducibles antes de mover código.

Gate: compilación y pruebas seleccionadas coherentes, arranque desde fuente e imágenes verificable, fallos pendientes identificados sin atribuirlos a la migración.

### Etapa 2: crear workspace y extraer el núcleo existente

- Fijar versiones compatibles: los manifiestos actuales no usan todos la misma versión mayor de NestJS.
- Crear las cuatro entradas de programa y trasladar configuración común cuidadosamente.
- Mover identidad y alimentos como módulos, conservando rutas, DTO, validadores y reglas existentes.
- Mover personal, turnos y asistencia desde eventos-emergencias al módulo de personal/logística del núcleo.
- Conservar temporalmente las bases/conexiones existentes para aislar esta reorganización de la migración de datos.
- No activar dos copias de un mismo consumidor o temporizador.

Gate: cuentas, compra de alimentos, cambios de turno y asistencia siguen funcionando con los mismos contratos. Los programas especializados nuevos no necesitan fingir casos aún inexistentes.

### Etapa 3: reunir Boletería

- Integrar ventas, catálogo, cola, acceso QR y postventa como módulos internos.
- Preservar la fila y consumir su turno exactamente una vez, vinculado al usuario y evento correcto.
- Sustituir llamadas HTTP internas por servicios del módulo.
- Reunificar los datos críticos de entrada, propiedad, reventa e ingreso sobre una copia migrada.
- Resolver reconciliación entre registros antiguos y los datos extraídos de acceso-qr/postventa.
- Retirar proyecciones que dejen de tener propósito, solo cuando la fuente unificada esté validada.

Gate: compra, cancelación, promoción, consulta, reventa e ingreso; 50 compradores sobre una publicación, doble escaneo y carrera transferencia/ingreso; QR viejo rechazado tras transferencia confirmada.

Esta es la parte con mayor riesgo de consistencia; no hacerla mediante un movimiento masivo sin comprobaciones intermedias.

### Etapa 4: módulo de pagos, trabajador y datos consolidados

- Reutilizar el adaptador de pagos, callbacks firmados y registro financiero.
- Reemplazar clientes HTTP internos por el módulo común; conservar un único endpoint público de webhook.
- El webhook registra resultado y trabajo pendiente de manera durable; el trabajador resuelve la finalización idempotente en el dominio correspondiente.
- Migrar sobre copia a una base con esquemas, mediante scripts repetibles y verificaciones.
- Conservar identificadores, hashes, sesiones que correspondan, estados, historiales, dinero, QR vigentes y referencias entre dominios.
- Comparar conteos, sumas monetarias, vigencia de QR, pedidos pendientes y referencias. Los conteos por sí solos no bastan.
- Migrar o drenar explícitamente trabajos, reservas activas y mensajes pendientes antes del cambio de tráfico.
- Añadir publicación durable y reclamación de trabajos segura entre réplicas.

Gate: reinicio entre pago y confirmación, callback duplicado o adelantado, proveedor lento, corte de RabbitMQ, tarea repetida y recuperación sin doble cobro ni pérdida silenciosa.

### Etapa 5: Operación con alcance mínimo real

- Implementar o conectar monitoreo, incidentes y evacuación en su programa especializado.
- Usar datos operativos compartidos mediante contratos de lectura y protocolos configurados.
- Evitar dependencia HTTP del núcleo para activar una evacuación.
- Integrar recepción y acuse en la app de personal.
- Probar prioridad y recuperación de alertas con núcleo detenido, una instancia de operación caída y proveedor lento.

Gate: evidencia del tablero y de entrega a dispositivos según las condiciones declaradas; los mocks deben identificarse.

### Etapa 6: completar funcionalidad pendiente en el lugar definitivo

Orden por dependencias:

1. Recintos/zonas, eventos y capacidades; roles/permisos y pertenencia.
2. Gestión completa de alimentos, preparación y entrega QR.
3. Parqueaderos y planificación de personal/proveedores, aprovechando las bases de turnos ya presentes.
4. Completar operación, conciliación financiera y exportaciones.

Algunas tareas pueden avanzar en paralelo una vez estables los contratos. La migración puede estar terminada sin que estén terminados los 32 CU, siempre que conserve lo que funcionaba, establezca las ubicaciones definitivas y señale con precisión lo pendiente.

Gate: cada CU completado tiene flujo real de interfaz a persistencia y alternativas relevantes, sin reglas de negocio nuevas en Angular o Flutter.

### Etapa 7: cerrar infraestructura, métricas y documentación

- Simplificar rutas del gateway hacia núcleo, boletería y operación; conservar contratos públicos.
- Actualizar Docker, Compose, arranque, imágenes, CI y CD a la arquitectura nueva.
- Mantener un perfil local sencillo y otro para replicación y pruebas de fallos.
- Proteger capacidad de conexión y consultas: compartir PostgreSQL significa que escalar Boletería aún puede afectar a los demás si no se controla.
- Medir RNF-07/08/09/10/17 con la arquitectura final.
- Actualizar SAD, SRS, diagramas, guía de arranque y reparto.
- Retirar código y configuración anteriores solamente cuando ya no se ejecuten y exista una reversión probada.

## 11. Protección de datos y cambio de versión

Trabajar primero sobre una copia. Respaldar y probar la restauración de PostgreSQL, y tratar explícitamente los mensajes y reservas temporales que aún estén activos.

No borrar volúmenes para facilitar una migración. Si se decide usar únicamente datos desechables de demostración, registrarlo; no convertir esa decisión en una garantía de migración de datos reales.

Para el cambio final, definir qué versión recibe nuevas operaciones, cómo se drenan las anteriores y cómo se confirma el resultado financiero de las pendientes. Una pausa controlada de demostración no equivale al despliegue sin interrupción que exige RNF-15.

Volver a una imagen anterior no garantiza reversión si la base ya se transformó de forma incompatible. Usar cambios de esquema compatibles, restauración probada o una estrategia explícita antes de habilitar escrituras nuevas.

## 12. Ramas y comprobación con el equipo

- `develop` sigue siendo la base compartida.
- `feature/sebastian-arquitectura` concentra esta migración, con commits pequeños por etapa.
- Abrir temprano una solicitud de integración en borrador hacia develop permite ver las diferencias y ejecutar CI. No integra el código automáticamente.
- El CI actual se activa por pull request y por push a main; un push aislado de una rama no garantiza esa ejecución.
- Acordar con el equipo dónde continúan los cambios funcionales durante la reorganización para evitar que dos personas muevan las mismas carpetas.
- Actualizar la rama de arquitectura con cambios necesarios de develop, y resolverlos allí.
- Integrar cuando se demuestre preservación funcional, datos y nueva ejecución.
- Después, los demás actualizan sus ramas desde develop y completan sus CU en los módulos definitivos.
- La integración final a main es un paso posterior, con la política de entrega del equipo.

No es necesario que Sebastián termine los casos de todos para entregar la migración. Sí debe existir un ejemplo funcional y probado de cada comunicación nueva y quedar documentado quién continúa cada CU.

## 13. Criterio para declarar terminada la migración

La migración está lista cuando:

- Los cuatro programas tienen responsabilidades y arranques claros.
- Lo que estaba implementado sigue funcionando con contratos estables o cambios de contrato documentados.
- No hay dos fuentes activas para propietarios, QR o estados de pedidos.
- No quedaron llamadas internas hacia servidores retirados.
- Un reinicio o mensaje duplicado no duplica dinero, entrega, cupo ni asistencia.
- Operación puede activar un protocolo con el núcleo detenido bajo las dependencias y sesiones declaradas.
- La transferencia de datos tiene verificación y reversión.
- Arranque, CI, imágenes publicadas y documentación describen el mismo sistema.
- Los CU pendientes están señalados y ubicados, sin afirmar que una pantalla simulada es un backend terminado.

Las metas de rendimiento, disponibilidad mensual y entrega de alertas se declaran demostradas únicamente con la evidencia correspondiente. El número reducido de programas no las demuestra por sí solo.

## 14. Fuentes y alcance de la revisión

Fuentes del repositorio, fijadas al commit revisado:

- [Casos de uso completos](https://github.com/Emperador24/HEXACORE/blob/2cd4fde22683d370dfe32991d983a0ae373b9908/Documentation/Work/RequisitosCasosUso.tex).
- [Requisitos no funcionales](https://github.com/Emperador24/HEXACORE/blob/2cd4fde22683d370dfe32991d983a0ae373b9908/Documentation/Work/RequisitosNoFuncionales.tex).
- [SRS: restricciones y reparto](https://github.com/Emperador24/HEXACORE/blob/2cd4fde22683d370dfe32991d983a0ae373b9908/Documentation/Work/EspecificacionRequisitos.tex).
- [SAD y decisiones arquitectónicas](https://github.com/Emperador24/HEXACORE/blob/2cd4fde22683d370dfe32991d983a0ae373b9908/Documentation/Work/DescripcionArquitecturaSoftware.tex).
- [Compose implementado](https://github.com/Emperador24/HEXACORE/blob/2cd4fde22683d370dfe32991d983a0ae373b9908/App/infra/docker-compose.yml).
- [Código de servicios](https://github.com/Emperador24/HEXACORE/tree/2cd4fde22683d370dfe32991d983a0ae373b9908/App/services).
- [Interfaces Angular y Flutter](https://github.com/Emperador24/HEXACORE/tree/2cd4fde22683d370dfe32991d983a0ae373b9908/App/frontend).
- [Informe de atributos disponible](https://github.com/Emperador24/HEXACORE/blob/2cd4fde22683d370dfe32991d983a0ae373b9908/App/infra/informe-atributos/INFORME.md).
- [CI revisado](https://github.com/Emperador24/HEXACORE/actions/runs/41179509340).
- [Publicación y prueba de arranque revisadas](https://github.com/Emperador24/HEXACORE/actions/runs/41179526424).
- [Integración de Samuel, PR #43](https://github.com/Emperador24/HEXACORE/pull/43).
- [Comparación de la rama remota de Sebastián con develop](https://github.com/Emperador24/HEXACORE/compare/3780537f651b8b1b2c665a43f6782bdfef360d1c...2cd4fde22683d370dfe32991d983a0ae373b9908).

Referencias técnicas primarias:

- [NestJS: aplicaciones y bibliotecas en un workspace](https://docs.nestjs.com/cli/monorepo).
- [Martin Fowler: coste adicional de microservicios](https://martinfowler.com/bliki/MicroservicePremium.html).

Se revisaron los 32 CU, los RNF, restricciones y decisiones, árbol de fuentes, configuraciones de arranque, rutas, manifiestos, código de flujos críticos y ejecuciones de automatización. No se hizo una auditoría línea por línea de cada archivo ni una ejecución local completa. Los estados funcionales de este plan son una base para verificación, no una certificación de terminación.
