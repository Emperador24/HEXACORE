import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { COLA_CAMBIOS_TURNO, declararTopologiaLogistica } from './eventos-topologia';

export { COLA_CAMBIOS_TURNO };

export interface CambioTurnoEvento {
  /**
   * Id del evento. RabbitMQ entrega *al menos una vez*: si el consumidor lo
   * procesa y se cae justo antes de confirmarlo, el broker lo reentrega. Una
   * clave estable es lo que permite al consumidor descartar el repetido en
   * vez de notificar dos veces.
   */
  id: string;
  // TURNO_CAMBIADO: CU-018, cambio de turno aprobado.
  // PERSONAL_ASIGNADO: CU-017, asignación de personal a una zona (paso 9).
  // ASIGNACION_CANCELADA / ASIGNACION_RECHAZADA: CU-007C y CU-007B.
  tipo: 'TURNO_CAMBIADO' | 'PERSONAL_ASIGNADO' | 'ASIGNACION_CANCELADA' | 'ASIGNACION_RECHAZADA';
  turnoId: string;
  empleadoAnteriorId?: string;
  empleadoNuevoId: string;
  mensaje: string;
  publicadoEn: string;
}

/** Publica los mismos eventos en la conexión compartida del Núcleo. */
@Injectable()
export class EventosPublicadorService implements OnModuleInit {
  private readonly logger = new Logger(EventosPublicadorService.name);
  constructor(private readonly conexion: ConexionRabbitMq) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaLogistica);
  }

  async publicarCambioTurno(evento: Omit<CambioTurnoEvento, 'id' | 'publicadoEn'>): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) {
      this.logger.warn('Canal de RabbitMQ no disponible; se omite la publicación del evento.');
      return;
    }
    const mensaje: CambioTurnoEvento = { id: randomUUID(), ...evento, publicadoEn: new Date().toISOString() };
    await new Promise<void>((resolve, reject) => {
      canal.sendToQueue(COLA_CAMBIOS_TURNO, Buffer.from(JSON.stringify(mensaje)),
        { persistent: true }, (error) => error ? reject(error) : resolve());
    });
  }
}
