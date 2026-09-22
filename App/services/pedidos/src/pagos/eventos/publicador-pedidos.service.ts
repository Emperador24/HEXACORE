import { Injectable, Logger } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { CLAVE_PEDIDO_CONFIRMADO, EVENTO_PEDIDO_CONFIRMADO, EXCHANGE_PEDIDOS, PedidoConfirmado } from './pedido-confirmado.evento';

/** Publicación posterior al commit, siguiendo PublicadorEventos de Reventa. Sin outbox ni reenvíos. */
@Injectable()
export class PublicadorPedidos {
  private readonly log = new Logger(PublicadorPedidos.name);
  constructor(private readonly conexion: ConexionRabbitMq) {}

  /** Nunca revierte una compra si el broker falla o no confirma el mensaje. */
  async publicarPedidoConfirmado(evento: PedidoConfirmado): Promise<boolean> {
    let temporizador: NodeJS.Timeout | undefined;
    try {
      const canal = this.conexion.obtenerCanal();
      if (!canal) throw new Error('Canal no disponible');
      const confirmado = await new Promise<boolean>((resolve) => {
        temporizador = setTimeout(() => resolve(false), 2000);
        canal.publish(EXCHANGE_PEDIDOS, CLAVE_PEDIDO_CONFIRMADO, Buffer.from(JSON.stringify(evento)), {
          persistent: true, contentType: 'application/json', messageId: evento.pedidoId,
          type: EVENTO_PEDIDO_CONFIRMADO, timestamp: Date.now(),
        }, (error) => resolve(!error));
      });
      if (!confirmado) throw new Error('Publicación no confirmada');
      return true;
    } catch {
      // Solo identificadores: no registrar el payload con datos del cliente.
      this.log.error(`PEDIDO_CONFIRMADO_NO_PUBLICADO pedido=${evento.pedidoId}; el pedido sigue confirmado`);
      return false;
    } finally {
      if (temporizador) clearTimeout(temporizador);
    }
  }
}
