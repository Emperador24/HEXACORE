import { ConfirmChannel } from 'amqplib';
import {
  EXCHANGE_REVENTA,
  EXCHANGE_MUERTOS,
  COLAS,
  colaMuertos,
  CLAVE_ENTRADA_TRANSFERIDA,
} from './eventos-reventa';
/** Se conservan exchanges, DLQ y bindings existentes. */
export async function declararTopologiaReventa(
  canal: ConfirmChannel,
): Promise<void> {
  await canal.assertExchange(EXCHANGE_REVENTA, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });
  for (const cola of Object.values(COLAS)) {
    const muertos = colaMuertos(cola);
    await canal.assertQueue(muertos, { durable: true });
    await canal.bindQueue(muertos, EXCHANGE_MUERTOS, cola);
    await canal.assertQueue(cola, {
      durable: true,
      deadLetterExchange: EXCHANGE_MUERTOS,
      deadLetterRoutingKey: cola,
    });
    await canal.bindQueue(cola, EXCHANGE_REVENTA, CLAVE_ENTRADA_TRANSFERIDA);
  }
}
