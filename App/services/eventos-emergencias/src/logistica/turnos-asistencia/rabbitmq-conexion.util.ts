import * as amqplib from 'amqplib';

/**
 * RabbitMQ puede reportar su healthcheck como "healthy" un instante antes de
 * que el puerto AMQP esté realmente listo para aceptar conexiones — al
 * arrancar todo con un solo `docker compose up`, la primera conexión puede
 * fallar por una simple carrera de arranque, no porque el broker no vaya a
 * estar disponible. Reintenta con backoff fijo antes de rendirse.
 */
export async function conectarConReintento(
  url: string,
  intentos = 10,
  esperaMs = 2000,
): Promise<amqplib.ChannelModel> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await amqplib.connect(url);
    } catch (error) {
      ultimoError = error;
      if (intento < intentos) {
        await new Promise((resolve) => setTimeout(resolve, esperaMs));
      }
    }
  }
  throw ultimoError;
}
