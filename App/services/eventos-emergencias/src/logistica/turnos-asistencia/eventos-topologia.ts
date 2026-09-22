/**
 * Topología de RabbitMQ de CU-018 (ADR-10). Un solo archivo para que
 * publicador y consumidor no puedan desincronizarse por una errata — mismo
 * criterio que `entradas-mercado-secundario/src/reventa/eventos/topologia.ts`.
 */

/**
 * Prefijo opcional de los nombres de cola.
 *
 * En producción va vacío y los nombres son los de siempre. Las pruebas de
 * integración lo usan para tener sus propias colas: RabbitMQ es compartido, y
 * sin esto el consumidor que corre dentro del contenedor se queda los mensajes
 * que publica la prueba y escribe la notificación en la base de desarrollo —
 * la prueba entonces espera una notificación que nunca le llega.
 */
const PREFIJO = process.env.PREFIJO_COLAS ?? '';

/** Cola de trabajo: cambios de turno ya aprobados. */
export const COLA_CAMBIOS_TURNO = `${PREFIJO}turnos.cambios`;

/** Cola de mensajes muertos de la cola de arriba (ADR-10: DLQ nativa de RabbitMQ). */
export const COLA_CAMBIOS_TURNO_DLQ = `${PREFIJO}turnos.cambios.dlq`;

/**
 * Cuántas veces se reintenta un mensaje antes de mandarlo a la DLQ. Fijo y
 * no configurable: un número más alto no arregla un fallo permanente y solo
 * retrasa que alguien se entere.
 */
export const MAXIMO_INTENTOS = 3;
