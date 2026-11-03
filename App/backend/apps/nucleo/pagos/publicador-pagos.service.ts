import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';

/** Exchange del resultado financiero. Publicarlo no finaliza pedidos ni compras. */
export const EXCHANGE_PAGOS = 'pagos.eventos';

import type { EventoPago, TipoEventoPago } from '../../../modulos/finanzas/pagos';

const CLAVES: Record<TipoEventoPago, string> = {
  PAGO_APROBADO: 'pago.aprobado',
  PAGO_RECHAZADO: 'pago.rechazado',
};

/**
 * Publica `PagoAprobado` / `PagoRechazado` en el broker.
 *
 * Solo declara el exchange: las colas son de quien consume. Así Pagos no
 * necesita saber quién escucha, que es la razón de publicar en vez de llamar.
 */
@Injectable()
export class PublicadorPagos implements OnModuleInit {
  private readonly log = new Logger(PublicadorPagos.name);

  constructor(private readonly conexion: ConexionRabbitMq) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(async (canal) => {
      await canal.assertExchange(EXCHANGE_PAGOS, 'topic', { durable: true });
    });
  }

  /** `true` solo si el broker confirmó que lo guardó. Nunca lanza. */
  async publicar(evento: EventoPago): Promise<boolean> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) {
      this.log.error(`RabbitMQ no disponible: no se publicó ${evento.tipo} de ${evento.claveIdempotencia}`);
      return false;
    }
    try {
      return await new Promise<boolean>((resolve) => {
        canal.publish(
          EXCHANGE_PAGOS,
          CLAVES[evento.tipo],
          Buffer.from(JSON.stringify(evento)),
          { persistent: true, contentType: 'application/json', messageId: evento.id, type: evento.tipo },
          (error) => resolve(!error),
        );
      });
    } catch (error) {
      this.log.error(`Fallo al publicar ${evento.tipo}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}
