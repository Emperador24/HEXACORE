import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CONEXION } from '../../persistencia/conexion';
import { EventoReferencia } from '../../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../../persistencia/entidades/publicacion-reventa.entity';
import {
  ConsumidorEventosGestion,
  MensajeEvento,
  estadoDe,
  guardarCopiaEvento,
} from '../../../compartido/consumidor-eventos-gestion';
import { ClienteVentas } from '../cliente-ventas.service';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';

/**
 * CU-026 → CU-006: la copia del evento de Postventa sigue a Núcleo y, si el
 * evento se cancela, el mercado secundario se cierra para él.
 *
 * Al cancelarse:
 * - `permiteReventa` queda en false, así que nadie publica más (CU-006F).
 * - Las publicaciones ACTIVA se retiran con el mismo orden que CU-006B:
 *   primero el anuncio, después la entrada vuelve a su dueño, y de ahí Ventas
 *   la devuelve con CU-003. Si Ventas llegó antes y ya la anuló, devolverla no
 *   la resucita: Ventas condiciona su UPDATE a `EN_REVENTA`.
 * - Un checkout en curso no se espera: `pagar` comprueba que la publicación
 *   siga ACTIVA antes de cobrar, así que no llega a cobrarse.
 */
@Injectable()
export class ConsumidorEventosPostventa extends ConsumidorEventosGestion {
  protected readonly cola = 'postventa.eventos';

  constructor(
    @InjectDataSource(CONEXION) private readonly fuenteDatos: DataSource,
    private readonly ventas: ClienteVentas,
    conexion: ConexionRabbitMq,
  ) {
    super(conexion);
  }

  async aplicar(mensaje: MensajeEvento): Promise<void> {
    const cancelado = estadoDe(mensaje) === 'CANCELADO';
    await this.fuenteDatos.transaction(async (m) => {
      const e = mensaje.evento;
      await guardarCopiaEvento(m, EventoReferencia, mensaje, {
        nombre: e.nombre,
        fechaInicio: new Date(e.fechaInicio),
        lugar: e.lugar,
        ciudad: e.ciudad,
        permiteReventa: cancelado ? false : e.permiteReventa,
      });
    });
    // Se repite en cada entrega del mensaje de cancelación: si una anterior
    // se cortó a medias, esta retira lo que quedó.
    if (cancelado) await this.retirarPublicaciones(mensaje.eventoId);
  }

  private async retirarPublicaciones(eventoId: string): Promise<void> {
    const activas = await this.fuenteDatos.manager.find(PublicacionReventa, {
      where: { eventoId, estado: EstadoPublicacion.ACTIVA },
    });
    let retiradas = 0;
    for (const publicacion of activas) {
      const cerrada = await this.fuenteDatos.manager.update(
        PublicacionReventa,
        { id: publicacion.id, estado: EstadoPublicacion.ACTIVA },
        { estado: EstadoPublicacion.RETIRADA, fechaCierre: new Date() },
      );
      if (!cerrada.affected) continue; // se vendió o retiró entretanto
      await this.ventas.devolverDeReventa(publicacion.entradaId, this.ventas.comoServicio());
      retiradas += 1;
    }
    if (retiradas > 0) this.log.log(`Evento ${eventoId} cancelado: ${retiradas} publicaciones retiradas del mercado`);
  }
}
