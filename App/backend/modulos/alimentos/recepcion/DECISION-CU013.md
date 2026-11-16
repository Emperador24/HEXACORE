# CU-013: preparación e integración de entrega CU-014

Referencia comprobada antes de ampliar: conjunto CU-012/015 4/4, CU-011 9/9 y
recuperación CU-012 con cinco intenciones. Los incidentes SQL/DNS/499 anteriores
siguen abiertos; no se atribuyen a una causa única ni se consideran resueltos.

La fuente es la ficha CU-013 de `CU_eventos_completo.xlsx`. Incluye entrega:
el hito de preparación implementó pasos 1–6. La integración de
[CU-014](DECISION-CU014.md) completa pasos 7–12: QR válido/punto correcto,
entrega única e invalidación operativa. La ficha aún usa CU-003/A–G como códigos
históricos internos; esta nota los relaciona con CU-013 sin reducir requisitos.

## Modelo y tiempos

`pedidos.estado=CONFIRMADO` mantiene su significado para PagosService. El avance
se guarda aparte: RECIBIDO → EN_PREPARACION → LISTO_PARA_ENTREGAR. No hay estados
de entrega anticipados. Un confirmado histórico sin fila de preparación se
proyecta RECIBIDO, versión 0; su primer cambio crea la fila. La bandeja lee SQL,
no la entrega del evento RabbitMQ. Un pago aprobado persistido es obligatorio
para cambiar preparación; un confirmado inconsistente se muestra con aviso y
sin permiso de avance. Expirados/no pagados no se preparan y cancelados no avanzan.

El inicio admite 1–240 minutos. El reloj es PostgreSQL al ejecutar la transición:
estimación = inicio + minutos. Retraso añade 1–240 minutos a la mayor fecha entre
la estimación anterior y ahora; exige motivo. Una estimación superada se deriva
al leer, sin escribir ni emitir avisos en cada sondeo. Listo conserva tiempos
previos y registra su propia fecha. Cerrar al público no bloquea estos cambios.

Cada acción exige UUID de idempotencia y versión leída. Se bloquea el pedido,
se comprueba actor/clave/petición y se valida la versión. En una transacción SQL
se guardan avance, incidencia si corresponde e historial. El historial contiene
también el aviso visible y una respuesta inmutable: no hay ventana entre cambiar
estado y persistir aviso. Replay devuelve el resultado anterior sin reiniciar
tiempos; otra clave con una versión vieja se rechaza. No hay Redis, HTTP externo
ni publicación de mensajes dentro de esta transacción.

## Incidencias y alcance pendiente

Un faltante se reporta expresamente durante EN_PREPARACION, opcionalmente referido
a un producto del detalle histórico. Disponible cero tras vender no lo genera.
La incidencia avisa al cliente y bloquea marcar listo hasta que el personal
registre su resolución. Resolver exige motivo y deja actor/fecha; solo acredita
que puede prepararse lo acordado. Nunca autoriza sustitución, cambio de precio,
cancelación, un nuevo cobro o devolución. CU-011F/F12 siguen pendientes.

Alternativos: A cubre reporte, resolución y comunicación conservadora; cualquier
cancelación/sustitución depende de su política. B cubre demora y aviso durable.
C, E y F (entrega prematura, duplicada/punto incorrecto y QR inválido) se rechazan en CU-014.
D bloquea preparación y entrega de cancelados; originar
esa cancelación/coordinar dinero sigue en CU-011F/F12. G se cubre con versión,
idempotencia e historial para impedir iniciar dos veces, y entrega única persistida
en CU-014. No se confunden pedidos distintos de un cliente con duplicados.

## Consultas y canal

Personal activo/vinculado usa la lista privada, incluidos establecimientos cerrados.
Sus listados no contienen cliente ni QR. Cliente consulta solo pedidos propios,
detalle y avisos; el QR persistido solo se muestra como utilizable antes de entregar.
La proyección ENTREGADO y su fecha se recuperan al recargar. El canal es la bandeja dentro de web/app:
no se declara correo, push ni entrega exactamente una vez. Inicio, retraso, listo,
incidencia y resolución producen un aviso durable por operación.

Las listas se consultan en páginas de 100 (`pagina` desde 0, con orden estable
por fecha e identificador). Web y Flutter permiten ir a pedidos anteriores y
volver a los recientes; cambiar de establecimiento reinicia la página. No se
ocultan definitivamente los confirmados históricos por el tamaño de la bandeja.
El sondeo actualiza solo la página activa; el detalle se recupera por su ID y
conserva las comprobaciones de dueño/vínculo aunque no esté en esa página.

Las pantallas actualizan solo su establecimiento/pedido activo, como máximo cada
15 segundos, sin solapar solicitudes. Se suspenden al ocultarse/salir y se pausan
ante errores hasta actualización explícita. No hay sondeo global ni otro servidor.

## Actualización de integración CU-011F — 11/11/2026

Las menciones anteriores a CU-011F pendiente conservan el alcance histórico de
CU-013. La cancelación del establecimiento ya se implementó en
[DECISION-CU011F.md](DECISION-CU011F.md), con la misma serialización del pedido,
historial/avisos y política conservadora de inventario. F12 global sigue pendiente.
