import type { ConfirmChannel } from 'amqplib';

/** Lo publica Acceso QR al validar un ingreso (CU-002); ver `entradas/acceso-qr/acceso/ingreso.service.ts`. */
export const EXCHANGE_ACCESO = 'acceso.eventos';
export const CLAVE_INGRESO = 'ingreso.registrado';

/** Prefijo de colas de las pruebas (igual que en logística); vacío en producción. */
const PREFIJO = process.env.PREFIJO_COLAS ?? '';
export const COLA_INGRESOS = `${PREFIJO}operacion.ingresos`;
export const COLA_INGRESOS_DLQ = `${PREFIJO}operacion.ingresos.dlq`;
export const MAXIMO_INTENTOS = 3;

/** Cola propia del monitoreo atada al exchange de Acceso QR: no le quita mensajes a Ventas. */
export async function declararTopologiaMonitoreo(canal: ConfirmChannel): Promise<void> {
  await canal.assertExchange(EXCHANGE_ACCESO, 'topic', { durable: true });
  await canal.assertQueue(COLA_INGRESOS_DLQ, { durable: true });
  await canal.assertQueue(COLA_INGRESOS, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': COLA_INGRESOS_DLQ },
  });
  await canal.bindQueue(COLA_INGRESOS, EXCHANGE_ACCESO, CLAVE_INGRESO);
}
