import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as amqplib from 'amqplib';
import { Repository } from 'typeorm';
import { Notificacion } from './entities/notificacion.entity.js';
import { CambioTurnoEvento, COLA_CAMBIOS_TURNO } from './eventos-publicador.service.js';

/**
 * Consumidor de la cola "turnos.cambios". Representa el módulo de
 * notificaciones que reacciona de forma asíncrona a un cambio de turno
 * aprobado; persiste la evidencia (Notificacion) para poder demostrar en
 * vivo la latencia real de publicación→consumo en la sustentación.
 */
@Injectable()
export class EventosConsumidorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventosConsumidorService.name);
  private conexion: amqplib.ChannelModel | null = null;
  private canal: amqplib.Channel | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Notificacion)
    private readonly notificaciones: Repository<Notificacion>,
  ) {}

  async onModuleInit() {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
    try {
      this.conexion = await amqplib.connect(url);
      this.canal = await this.conexion.createChannel();
      await this.canal.assertQueue(COLA_CAMBIOS_TURNO, { durable: true });
      await this.canal.consume(COLA_CAMBIOS_TURNO, (msg) => this.procesar(msg));
      this.logger.log(`Escuchando la cola "${COLA_CAMBIOS_TURNO}".`);
    } catch (error) {
      this.logger.warn(
        `No se pudo conectar el consumidor a RabbitMQ. (${(error as Error).message})`,
      );
    }
  }

  async onModuleDestroy() {
    await this.canal?.close();
    await this.conexion?.close();
  }

  private async procesar(msg: amqplib.ConsumeMessage | null) {
    if (!msg || !this.canal) {
      return;
    }
    const evento = JSON.parse(msg.content.toString()) as CambioTurnoEvento;
    const latenciaMs = Date.now() - new Date(evento.publicadoEn).getTime();

    const notificacion = this.notificaciones.create({
      tipo: evento.tipo,
      turnoId: evento.turnoId,
      empleadoId: evento.empleadoNuevoId,
      mensaje: `Se te asignó el turno ${evento.turnoId} por cambio aprobado.`,
      latenciaMs,
    });
    await this.notificaciones.save(notificacion);

    this.canal.ack(msg);
  }
}
