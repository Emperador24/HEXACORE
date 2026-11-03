import { Injectable, Logger } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { EntradaTransferida } from './entrada-transferida.evento';
import { CLAVE_ENTRADA_TRANSFERIDA, EXCHANGE_REVENTA } from './topologia';

/**
 * Publicador de Eventos (SAD §9).
 *
 * En la vista de componentes es el que *"publica el evento de transferencia
 * completada"* hacia la cola, por AMQP. Es el último eslabón del flujo
 * síncrono: cuando este componente actúa, la venta ya está cerrada en la base
 * de datos.
 */
@Injectable()
export class PublicadorEventos {
  private readonly log = new Logger(PublicadorEventos.name);

  constructor(private readonly conexion: ConexionRabbitMq) {}

  /**
   * Paso 6 del diagrama de secuencia: publica `ENTRADA_TRANSFERIDA`.
   *
   * **Nunca lanza.** Si el broker no está o el mensaje no se confirma, lo
   * registra como error y devuelve `false`, pero no propaga la excepción.
   *
   * La razón es el orden del CU-006: para cuando se llama a este método, el
   * comprador ya pagó y la entrada ya cambió de dueño en la base. Hacer fallar
   * esa petición porque un correo no salió sería mentirle al comprador sobre
   * una compra que sí se completó — y el diagrama de secuencia es explícito al
   * respecto: *"Entradas responde al portal apenas confirma en base de datos"*,
   * y publicar queda *"fuera del camino de respuesta"*.
   *
   * Lo que queda pendiente es la otra mitad del problema: un evento que no se
   * publicó se pierde. La solución de libro es el patrón *outbox* —escribir el
   * evento en la misma transacción que la venta y que un proceso aparte lo
   * publique—, y es lo que habría que hacer si este sistema fuera a producción.
   * Está anotado en DECISIONES.md §9.
   */
  async publicarEntradaTransferida(evento: EntradaTransferida): Promise<boolean> {
    const canal = this.conexion.obtenerCanal();

    if (!canal) {
      this.log.error(
        `RabbitMQ no disponible: no se publicó ENTRADA_TRANSFERIDA de ${evento.transferencia.numeroTransaccion}. ` +
          'La venta SÍ se completó; faltan la notificación y la liquidación.',
      );
      return false;
    }

    try {
      const confirmado = await new Promise<boolean>((resolve) => {
        canal.publish(
          EXCHANGE_REVENTA,
          CLAVE_ENTRADA_TRANSFERIDA,
          Buffer.from(JSON.stringify(evento)),
          {
            // `persistent` es el `delivery_mode=2` del PoC-05: el broker
            // escribe el mensaje a disco. Cuesta latencia (162 ms de mediana
            // frente a 16 ms sin persistir) y aun así queda treinta y cinco
            // veces por debajo del umbral de RNF-17. Perder una transferencia
            // por un reinicio del broker no es negociable.
            persistent: true,
            contentType: 'application/json',
            // `messageId` estable = id de la transacción: es lo que permite a
            // un consumidor descartar un duplicado.
            messageId: evento.id,
            type: evento.evento,
            timestamp: Date.now(),
          },
          // Este callback es la confirmación del broker. Sin él, `publish`
          // devuelve true en cuanto el mensaje sale del proceso y no se sabría
          // si llegó a guardarse.
          (error) => resolve(!error),
        );
      });

      if (!confirmado) {
        this.log.error(
          `El broker no confirmó ENTRADA_TRANSFERIDA de ${evento.transferencia.numeroTransaccion}`,
        );
        return false;
      }

      this.log.log(
        `Publicado ENTRADA_TRANSFERIDA ${evento.transferencia.numeroTransaccion} ` +
          `(entrada ${evento.entrada.numeroTicket})`,
      );
      return true;
    } catch (error) {
      this.log.error(
        `Fallo al publicar ENTRADA_TRANSFERIDA de ${evento.transferencia.numeroTransaccion}: ` +
          `${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}
