import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConexionRabbitMq } from '../../comun/rabbitmq/conexion-rabbitmq.service';

/** Exchange de los hechos de Pagos. Lo consume Ventas para cerrar la Saga de compra. */
export const EXCHANGE_PAGOS = 'pagos.eventos';

export type TipoEventoPago = 'PAGO_APROBADO' | 'PAGO_RECHAZADO';

/**
 * Resultado de un cobro o un reembolso **confirmado por la pasarela** (ADR-15).
 *
 * El `id` es la clave de idempotencia más el resultado: el webhook puede llegar
 * repetido, y quien consume necesita algo con lo que descartar el duplicado.
 */
export interface EventoPago {
  id: string;
  tipo: TipoEventoPago;
  version: 1;
  ocurridoEn: string;
  claveIdempotencia: string;
  operacion: 'COBRO' | 'REEMBOLSO';
  solicitante: string;
  monto: number;
  moneda: string;
  referencia: string | null;
  motivo: string | null;
}

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
