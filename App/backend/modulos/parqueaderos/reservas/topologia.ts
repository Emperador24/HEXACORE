import type { ConfirmChannel } from 'amqplib';

/** Prefijo de colas de las pruebas (igual que en logística); vacío en producción. */
const PREFIJO = process.env.PREFIJO_COLAS ?? '';

/**
 * CU-021, paso 9: la confirmación de la reserva con su QR sale del flujo de
 * pago por esta cola, como el correo de la compra de entradas (CU-001, paso 8):
 * si el broker falla, la reserva ya está confirmada y el aviso espera.
 */
export const COLA_RESERVAS = `${PREFIJO}parqueaderos.reservas`;
export const COLA_RESERVAS_DLQ = `${PREFIJO}parqueaderos.reservas.dlq`;
export const MAXIMO_INTENTOS = 3;

export async function declararTopologiaReservas(canal: ConfirmChannel): Promise<void> {
  await canal.assertQueue(COLA_RESERVAS_DLQ, { durable: true });
  await canal.assertQueue(COLA_RESERVAS, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': COLA_RESERVAS_DLQ },
  });
}
