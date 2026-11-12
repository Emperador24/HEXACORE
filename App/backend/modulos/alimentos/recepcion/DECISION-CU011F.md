# CU-011F: cancelación por el establecimiento y seguimiento del reembolso

Referencia leída: fichas CU-011, CU-013 y CU-014 de
`Documentation/Submission/CU_eventos_completo.xlsx`, requisitos generados y
DECISION-CU012/013/014. El alcance es cancelar por Personal; no hay cancelación
voluntaria del cliente, sustituciones, cambios de precio ni recuperación global F12.

## Transición y autorización

POST `pedidos/establecimientos/:local/pedidos/:pedido/cancelacion`, UUID de
Idempotency-Key, versión revisada, motivo de 3–200 caracteres y `confirmar=true`.
Solo Personal activo y vinculado; se vuelve a bloquear/validar cuenta, vínculo,
establecimiento y pedido dentro de la transacción. El cierre al público no
revoca la gestión. Se exige un confirmado con exactamente un cobro aprobado,
importe/moneda coincidentes y referencia persistida. Entrega anterior y versión
obsoleta se rechazan. Cancelación y entrega usan el mismo bloqueo de Pedido;
la decisión ganadora impide la otra. Preparación también bloquea y revalida
CONFIRMADO antes de cambiar estado.

Se guardan juntos CANCELADO, actor/fecha/motivo, una fila por pedido, historial y
aviso durable CU-013. El avance conserva su significado y aumenta versión. No
se borran QR, snapshots ni cobros: la proyección cancelada no devuelve QR utilizable
y la validación de entrega relee SQL. El replay del pago mantiene el rechazo de
un pedido ya cancelado, sin reconfirmación, descuento ni evento nuevo. Un aviso
antiguo no autoriza ninguna transición.

## Dinero: intención y evidencia separadas

La cancelación persiste antes de solicitar dinero. Su fila contiene cobro
original, referencia, monto/moneda del servidor y una clave de reembolso UUID
generada una sola vez por el servidor. Solo se usa la API pública local de
Finanzas: `reembolsar` y lectura `consultar` del libro existente por clave y
solicitante. La nueva lectura no llama al proveedor, no altera el libro ni
recupera cobros F12. Alimentos no accede a las tablas de Finanzas.

Un claim SQL corto marca `intentado_en` antes de HTTP. Se libera la conexión y
todos los bloqueos antes de salir al proveedor. Réplicas, replay y reinicio no
reenvían una operación marcada: la pasarela simulada tiene idempotencia en
memoria, insuficiente para garantizar un reenvío después de reiniciarla.
Una caída entre claim y envío deja incertidumbre explícita, aunque no haya
registro financiero; se conserva la misma clave para conciliación, no se inventa
un rechazo ni se genera otra devolución. Las intenciones todavía no intentadas
pueden enviarse una vez tras reinicio.

PENDIENTE = aún no hay resultado; APROBADO exige confirmación con referencia;
RECHAZADO es respuesta definitiva financiera; INCIERTO = no hay evidencia
suficiente. Un sondeo acotado sin solapamiento y la consulta explícita leen el
libro para recuperar resultados confirmados, incluido webhook recibido por
Finanzas. Solo cambios reales de evidencia producen otro aviso CU-013. Un fallo
de lectura no rebaja un terminal conocido. No se afirma dinero devuelto por
cancelar, timeout, reserva liberada o devolución solicitada. Rechazo/incertidumbre
no reactivan el pedido; requieren seguimiento del establecimiento/Finanzas.

## Inventario conservador

La autoridad es la preparación registrada, no la falta de existencias actuales.
Solo RECIBIDO sin inicio, tiempos o historial contradictorios, con detalle
consistente y reserva CONSUMIDA/CONSUMO_PENDIENTE, permite restituir unidades.
Preparación iniciada/listo => NO_REINCORPORAR. Estado contradictorio o reserva
inconsistente => REVISION; no se incorpora automáticamente comida ambigua.

El pago ya descontó físico y disponible. Nunca se llama a liberar una reserva
ACTIVA para deshacer ese consumo. En la misma transacción de cancelación se
encolan incrementos positivos identificados en operaciones_inventario CU-012,
con sus propios UUID persistidos. El procesador existente serializa por local,
usa Lua idempotente y WAITAOF, y confirma físico + resultado SQL juntos. Repetir
una intención no repite el delta. El consumo técnico pendiente se cierra con
`consumir`, que no devuelve unidades; no se reconstruyen hashes, inventario ni
semillas. Un ajuste rechazado queda REVISION; un error técnico permanece pendiente.

## Interfaces y canales

Web y Flutter conservan intención por cuenta antes de enviar; respuesta perdida
se recupera con mismo UUID/petición/versión. Cambiar de pedido no reaprovecha un
formulario anterior. Personal puede consultar cancelación y reembolso. Cliente
ve motivo, fecha y estado financiero real, sin QR utilizable. El canal durable
es historial/avisos dentro de web/app; no se declara correo, push ni exactly-once
mediante RabbitMQ. Las pausas `presentar` de Playwright solo actúan en demo.

## Migración y verificación

Se añade únicamente CancelacionCu011F1794700000000: séptima de Alimentos,
35 registros actuales en total. Las 18 fuentes/procedencias históricas permanecen
intactas. Instalación vacía y actualización deben verificar nombres/propietarios,
conservación de datos y repetición sin DDL. No hay synchronize ni migrationsRun.
Los resultados ejecutados, versiones, pruebas pendientes y estado final de
Redash/CU-015 se registran en PLAN-CIERRE-SEBASTIAN.md; esta decisión no sustituye
la aceptación automática/visible ni acredita disponibilidad global.
