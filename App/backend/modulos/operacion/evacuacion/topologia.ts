import type { ConfirmChannel } from 'amqplib';

/** Prefijo de colas de las pruebas (igual que en logística); vacío en producción. */
const PREFIJO = process.env.PREFIJO_COLAS ?? '';

/**
 * CU-010, infraestructura no trivial: cola de **alta prioridad** para los
 * avisos de evacuación. Los de nivel 3 adelantan a los de nivel 1 que aún no
 * se han entregado. La consume la pasarela de notificaciones multicanal
 * (push, SMS, altavoces); dentro del Núcleo, `NotificadorEvacuacion`.
 */
export const COLA_EVACUACION = `${PREFIJO}operacion.evacuacion`;
export const COLA_EVACUACION_DLQ = `${PREFIJO}operacion.evacuacion.dlq`;
export const PRIORIDAD_MAXIMA = 10;
export const MAXIMO_INTENTOS = 3;

export async function declararTopologiaEvacuacion(canal: ConfirmChannel): Promise<void> {
  await canal.assertQueue(COLA_EVACUACION_DLQ, { durable: true });
  await canal.assertQueue(COLA_EVACUACION, {
    durable: true,
    arguments: {
      'x-max-priority': PRIORIDAD_MAXIMA,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': COLA_EVACUACION_DLQ,
    },
  });
}
