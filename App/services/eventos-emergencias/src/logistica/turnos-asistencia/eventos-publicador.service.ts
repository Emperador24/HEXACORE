import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export const COLA_CAMBIOS_TURNO = 'turnos.cambios';

export interface CambioTurnoEvento {
  tipo: 'TURNO_CAMBIADO';
  turnoId: string;
  empleadoAnteriorId: string;
  empleadoNuevoId: string;
  publicadoEn: string;
}

/**
 * Publicador de Eventos (SAD §9, componente interno de eventos-emergencias).
 * Propaga los cambios de turno ya aprobados (CU-018 / Infraestructura No
 * Trivial: "Cola de mensajes para propagar los cambios de turno ya
 * aprobados") para que otros módulos (p. ej. notificaciones a empleados,
 * o el panel de monitoreo de CU-019) puedan reaccionar sin acoplarse
 * síncronamente al flujo de aprobación.
 */
@Injectable()
export class EventosPublicadorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventosPublicadorService.name);
  private conexion: amqplib.ChannelModel | null = null;
  private canal: amqplib.Channel | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
    try {
      this.conexion = await amqplib.connect(url);
      this.canal = await this.conexion.createChannel();
      await this.canal.assertQueue(COLA_CAMBIOS_TURNO, { durable: true });
      this.logger.log(`Conectado a RabbitMQ (${url}), cola "${COLA_CAMBIOS_TURNO}" lista.`);
    } catch (error) {
      this.logger.warn(
        `No se pudo conectar a RabbitMQ en ${url}. Los eventos de cambio de turno no se publicarán hasta que esté disponible. (${(error as Error).message})`,
      );
    }
  }

  async onModuleDestroy() {
    await this.canal?.close();
    await this.conexion?.close();
  }

  async publicarCambioTurno(evento: Omit<CambioTurnoEvento, 'tipo' | 'publicadoEn'>) {
    if (!this.canal) {
      this.logger.warn('Canal de RabbitMQ no disponible; se omite la publicación del evento.');
      return;
    }
    const mensaje: CambioTurnoEvento = {
      tipo: 'TURNO_CAMBIADO',
      ...evento,
      publicadoEn: new Date().toISOString(),
    };
    this.canal.sendToQueue(COLA_CAMBIOS_TURNO, Buffer.from(JSON.stringify(mensaje)), {
      persistent: true,
    });
  }
}
