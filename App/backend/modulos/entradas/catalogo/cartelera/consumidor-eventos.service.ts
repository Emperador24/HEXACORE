import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../../compartido/rabbitmq/conexion-rabbitmq.service';
import {
  ConsumidorEventosGestion,
  MensajeEvento,
  estadoDe,
  guardarCopiaEvento,
  guardarLocalidades,
} from '../../compartido/consumidor-eventos-gestion';
import { CONEXION } from '../persistencia/conexion';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';

/**
 * CU-026 → CU-005: lo que el organizador publica en el portal administrativo
 * entra en la cartelera, y lo que cancela sale de ella.
 *
 * Si el broker no está, la cartelera sigue respondiendo con lo que ya tenía;
 * solo tarda en enterarse de lo nuevo.
 */
@Injectable()
export class ConsumidorEventosCatalogo extends ConsumidorEventosGestion {
  protected readonly cola = 'catalogo.eventos';

  constructor(
    @InjectDataSource(CONEXION) private readonly fuenteDatos: DataSource,
    conexion: ConexionRabbitMq,
  ) {
    super(conexion);
  }

  async aplicar(mensaje: MensajeEvento): Promise<void> {
    await this.fuenteDatos.transaction(async (m) => {
      const e = mensaje.evento;
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
        estado: estadoDe(mensaje) as EstadoEvento,
      });
      if (aplicado) await guardarLocalidades(m, LocalidadEvento, mensaje);
    });
  }
}
