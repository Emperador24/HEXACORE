import type { ConfirmChannel } from 'amqplib';

/** Prefijo de colas de las pruebas (igual que en evacuación); vacío en producción. */
const PREFIJO = process.env.PREFIJO_COLAS ?? '';

/**
 * CU-020, infraestructura no trivial: cola de **prioridad** para notificar al
 * supervisor y al responsable. Un incidente CRÍTICO adelanta a uno de
 * prioridad BAJA que aún no se haya entregado (RNF: "la notificación al
 * supervisor debe ser inmediata cuando el incidente es crítico").
 */
export const COLA_INCIDENTES = `${PREFIJO}operacion.incidentes`;
export const COLA_INCIDENTES_DLQ = `${PREFIJO}operacion.incidentes.dlq`;
export const PRIORIDAD_MAXIMA = 10;
export const MAXIMO_INTENTOS = 3;

export async function declararTopologiaIncidentes(canal: ConfirmChannel): Promise<void> {
  await canal.assertQueue(COLA_INCIDENTES_DLQ, { durable: true });
  await canal.assertQueue(COLA_INCIDENTES, {
    durable: true,
    arguments: {
      'x-max-priority': PRIORIDAD_MAXIMA,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': COLA_INCIDENTES_DLQ,
    },
  });
}
