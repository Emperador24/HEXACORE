import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../comun/rabbitmq/conexion-rabbitmq.service';
import {
  ConsumidorEventosGestion,
  MensajeEvento,
  estadoDe,
  guardarCopiaEvento,
} from '../../compartido/consumidor-eventos-gestion';
import { CONEXION } from '../persistencia/conexion';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';

/**
 * CU-026 → CU-002: la puerta conoce el aforo y el horario del evento que
 * publicó Núcleo y, si se cancela, rechaza los ingresos (`ingreso.service`
 * ya lo hace al ver la copia en CANCELADO). `asistentes` es de Acceso QR y no
 * se toca.
 */
@Injectable()
export class ConsumidorEventosAcceso extends ConsumidorEventosGestion {
  protected readonly cola = 'acceso.eventos-gestion';

  constructor(
    @InjectDataSource(CONEXION) private readonly fuenteDatos: DataSource,
    conexion: ConexionRabbitMq,
  ) {
    super(conexion);
  }

  async aplicar(mensaje: MensajeEvento): Promise<void> {
    await this.fuenteDatos.transaction(async (m) => {
      const e = mensaje.evento;
      await guardarCopiaEvento(m, EventoReferencia, mensaje, {
        nombre: e.nombre,
        fechaInicio: new Date(e.fechaInicio),
        fechaFin: new Date(e.fechaFin),
        lugar: e.lugar,
        ciudad: e.ciudad,
        aforoMaximo: e.aforoMaximo,
        estado: estadoDe(mensaje) as EstadoEvento,
      });
    });
  }
}
