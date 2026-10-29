/**
 * Topología de RabbitMQ del mercado secundario (ADR-10).
 *
 * El SAD nombra el evento `ENTRADA_TRANSFERIDA` pero no fija ningún nombre de
 * cola ni de *exchange*; los únicos nombres concretos del repo estaban en el
 * `dlq.py` del PoC-05, que eran de prueba. Estos son los definitivos, y viven
 * en un solo archivo para que publicador y consumidores no puedan
 * desincronizarse por una errata.
 *
 * ## Por qué un exchange de tipo `topic` y no enviar directo a una cola
 *
 * El paso 12 del CU-006 (notificar) y el paso 13 (liquidar) son **dos trabajos
 * distintos sobre el mismo hecho**. Con un `topic`, el Servicio de Entradas
 * publica una vez y cada consumidor tiene su propia cola: si la liquidación se
 * cae, las notificaciones siguen saliendo, y cada una reintenta su propio
 * mensaje sin arrastrar a la otra.
 *
 * Enviando directo a una cola habría que publicar dos veces y el publicador
 * tendría que conocer a sus consumidores — justo el acoplamiento que ADR-04
 * quería evitar.
 *
 * ## Por qué cada cola tiene su propia DLQ
 *
 * ADR-10 eligió RabbitMQ sobre Kafka precisamente por esto: *"DLQ y reintentos
 * nativos, que ASR-07 y ASR-13 exigen para no perder en silencio un evento que
 * falló"*. Un mensaje que un consumidor no logra procesar acaba en su cola de
 * muertos en vez de desaparecer o rebotar para siempre.
 */

/** Exchange al que el Servicio de Entradas publica los hechos del mercado secundario. */
export const EXCHANGE_REVENTA = 'reventa.eventos';

/** Exchange de mensajes muertos; cada cola manda aquí lo que no pudo procesar. */
export const EXCHANGE_MUERTOS = 'reventa.muertos';

/** Clave de enrutado del evento. El punto permite que un consumidor futuro use `entrada.*`. */
export const CLAVE_ENTRADA_TRANSFERIDA = 'entrada.transferida';

/** Nombre del evento tal como viaja en el mensaje y como lo llama el SAD. */
export const EVENTO_ENTRADA_TRANSFERIDA = 'ENTRADA_TRANSFERIDA';

/** Versión del contrato publicado en `App/shared/eventos/entrada-transferida.schema.json`. */
export const VERSION_ENTRADA_TRANSFERIDA = 1;

/**
 * Colas suscritas al evento. Cada una es un trabajo distinto del CU-006.
 *
 * `notificaciones` cubre el paso 12 (*"Notificar al comprador y al vendedor"*)
 * y `liquidaciones` el paso 13 (*"Liquidar el pago correspondiente al
 * vendedor"*).
 */
export const COLAS = {
  notificaciones: 'reventa.notificaciones',
  liquidaciones: 'reventa.liquidaciones',
} as const;

/** Cola de mensajes muertos correspondiente a cada cola de trabajo. */
export function colaMuertos(cola: string): string {
  return `${cola}.dlq`;
}

/**
 * Cuántas veces se reintenta un mensaje antes de mandarlo a la DLQ.
 *
 * No es configurable a propósito: un número más alto no arregla un fallo
 * permanente (un mensaje mal formado fallará las mil veces) y solo retrasa el
 * momento en que alguien se entera. Tres intentos cubren el fallo transitorio
 * —la base de datos parpadeó, el proveedor de correo tardó— y lo demás debe
 * verse en la DLQ cuanto antes.
 */
export const MAXIMO_INTENTOS = 3;
