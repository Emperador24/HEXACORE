/**
 * Topología de RabbitMQ del Servicio de Administración.
 *
 * El CU-027 la pide explícitamente en su infraestructura: *"cola de mensajes
 * para el envío asíncrono de correos de verificación/recuperación"*.
 *
 * ## Por qué el correo no se envía en la misma petición
 *
 * El registro responde al usuario en cuanto la cuenta está creada. Si el envío
 * del correo fuera parte de esa petición, un proveedor lento la alargaría, y
 * uno caído la haría fallar — el registro se perdería por un correo, cuando la
 * cuenta ya estaba bien creada.
 *
 * Con la cola, el envío ocurre fuera del camino de respuesta y con reintentos
 * propios, que es justo lo que pide CU-027E: *"el sistema reintenta y notifica
 * al usuario si el error persiste"*.
 *
 * ## Topología propia, no la del CU-006
 *
 * Este servicio declara su exchange y sus colas, separados de los de reventa.
 * Comparten broker pero nada más: si la cola de correos se atasca, las
 * notificaciones de una venta siguen saliendo.
 */

/** Exchange al que este servicio publica los hechos de cuentas. */
export const EXCHANGE_CUENTAS = 'cuentas.eventos';

/** Exchange de mensajes muertos. */
export const EXCHANGE_MUERTOS = 'cuentas.muertos';

/** Clave de enrutado de los correos por enviar. */
export const CLAVE_CORREO_PENDIENTE = 'cuenta.correo';

/** Cola del proceso que habla con el proveedor de notificaciones. */
export const COLA_CORREOS = 'cuentas.correos';

/** Cola de muertos correspondiente. */
export const COLA_CORREOS_DLQ = `${COLA_CORREOS}.dlq`;

/**
 * Intentos antes de mandar el mensaje a la DLQ.
 *
 * Tres, como en el CU-006 y por el mismo motivo: cubren el fallo pasajero —el
 * proveedor devolvió un 503 un momento— sin retrasar el momento en que alguien
 * se entera de un fallo permanente, como una dirección que no existe.
 */
export const MAXIMO_INTENTOS = 3;

/** Nombre y versión del evento, tal como viajan en el mensaje. */
export const EVENTO_CORREO_PENDIENTE = 'CORREO_PENDIENTE';
export const VERSION_CORREO_PENDIENTE = 1;
