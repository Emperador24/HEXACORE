import type { ConfirmChannel } from 'amqplib';

/** Prefijo de colas de las pruebas (igual que en operación); vacío en producción. */
const PREFIJO = process.env.PREFIJO_COLAS ?? '';

/**
 * CU-031, infraestructura no trivial: "integración asíncrona con la pasarela
 * de pagos externa vía cola de mensajes". Solicitar una conciliación solo dos
 * escribe la fila (paso 1-2); la comparación de verdad contra la pasarela
 * (paso 3) la hace, aparte, quien consuma esta cola — así una pasarela lenta
 * o caída no bloquea la petición HTTP del administrador financiero.
 */
export const COLA_CONCILIACION = `${PREFIJO}finanzas.conciliacion`;
export const COLA_CONCILIACION_DLQ = `${PREFIJO}finanzas.conciliacion.dlq`;
export const MAXIMO_INTENTOS = 3;

export async function declararTopologiaConciliacion(canal: ConfirmChannel): Promise<void> {
  await canal.assertQueue(COLA_CONCILIACION_DLQ, { durable: true });
  await canal.assertQueue(COLA_CONCILIACION, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': COLA_CONCILIACION_DLQ },
  });
}
