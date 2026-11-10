import { CONEXION } from '../persistencia/conexion';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../comun/eventos/conexion-rabbitmq.service';
import {
  ConsumidorEventosGestion,
  MensajeEvento,
  estadoDe,
  guardarCopiaEvento,
  guardarLocalidades,
} from '../../compartido/consumidor-eventos-gestion';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import { CancelacionService } from './cancelacion.service';

/**
 * CU-026 → CU-001/CU-003: Ventas vende lo que Núcleo publica y, si el evento
 * se cancela, deja de venderlo y devuelve el dinero a quien compró (CU-026D).
 *
 * El orden importa: primero la copia queda CANCELADO —eso cierra la venta en
 * `compra.service` y pone la política de CU-003 en el 100 %— y después se
 * devuelve compra por compra. La devolución se intenta en cada entrega del
 * mensaje de cancelación, aunque la copia ya estuviera aplicada: si una
 * entrega anterior se cortó a medias, la siguiente termina lo que faltó.
 */
@Injectable()
export class ConsumidorEventosVentas extends ConsumidorEventosGestion {
  protected readonly cola = 'ventas.eventos';

  constructor(
    @InjectDataSource(CONEXION) private readonly fuenteDatos: DataSource,
    private readonly cancelaciones: CancelacionService,
    conexion: ConexionRabbitMq,
  ) {
    super(conexion);
  }

  async aplicar(mensaje: MensajeEvento): Promise<void> {
    await this.fuenteDatos.transaction(async (m) => {
      const e = mensaje.evento;
      // `asistentes`, `vendidas` y `reservadas` son de Ventas: no se tocan.
      const aplicado = await guardarCopiaEvento(m, EventoReferencia, mensaje, {
        nombre: e.nombre,
        descripcion: e.descripcion,
        categoria: e.categoria,
        artista: e.artista,
        imagenUrl: e.imagenUrl,
        fechaInicio: new Date(e.fechaInicio),
        fechaFin: new Date(e.fechaFin),
        lugar: e.lugar,
        ciudad: e.ciudad,
        permiteReventa: e.permiteReventa,
        aforoMaximo: e.aforoMaximo,
        estado: estadoDe(mensaje) as EstadoEvento,
      });
      if (aplicado) await guardarLocalidades(m, LocalidadEvento, mensaje);
    });

    if (mensaje.tipo === 'EVENTO_CANCELADO' && mensaje.cancelacion?.requiereDevolucion) {
      const copia = await this.fuenteDatos.manager.findOneBy(EventoReferencia, { eventoId: mensaje.eventoId });
      // Una versión posterior no puede "descancelar" (Núcleo no lo permite),
      // pero si la copia no dice CANCELADO no se devuelve nada al 100 %.
      if (copia?.estado !== EstadoEvento.CANCELADO) return;
      const motivo = `Evento cancelado por el organizador${mensaje.cancelacion.motivo ? `: ${mensaje.cancelacion.motivo}` : ''}`.slice(0, 500);
      await this.cancelaciones.devolverPorEventoCancelado(mensaje.eventoId, motivo);
    }
  }
}
