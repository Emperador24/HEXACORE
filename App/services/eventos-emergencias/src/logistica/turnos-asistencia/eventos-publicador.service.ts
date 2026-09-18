import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { COLA_CAMBIOS_TURNO, COLA_CAMBIOS_TURNO_DLQ } from './eventos-topologia.js';
import { conectarConReintento } from './rabbitmq-conexion.util.js';

export { COLA_CAMBIOS_TURNO };

export interface CambioTurnoEvento {
  /**
   * Id del evento. RabbitMQ entrega *al menos una vez*: si el consumidor lo
   * procesa y se cae justo antes de confirmarlo, el broker lo reentrega. Una
   * clave estable es lo que permite al consumidor descartar el repetido en
   * vez de notificar dos veces.
   */
  id: string;
  tipo: 'TURNO_CAMBIADO';
  turnoId: string;
  empleadoAnteriorId: string;
  empleadoNuevoId: string;
  publicadoEn: string;
}

/** Argumentos de la cola: mensaje sin procesar → esta misma DLQ (exchange por defecto). */
const ARGUMENTOS_COLA = {
  'x-dead-letter-exchange': '',
  'x-dead-letter-routing-key': COLA_CAMBIOS_TURNO_DLQ,
};

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
  private cerrando = false;
  private url = '';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.url = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://hexacore:hexacore@localhost:5672', // App/infra/docker-compose.yml
    );
    await this.conectar();
  }

  private async conectar() {
    try {
      this.conexion = await conectarConReintento(this.url);
      // Un canal/conexión caído no se recupera solo: si no se reintenta
      // aquí, el servicio queda publicando "en el vacío" hasta el próximo
      // reinicio manual, aunque el broker ya haya vuelto.
      this.conexion.once('close', () => this.reconectarSiHaceFalta());
      this.conexion.once('error', () => this.reconectarSiHaceFalta());

      this.canal = await this.conexion.createChannel();
      // Un canal es su propio EventEmitter: un error de protocolo (p. ej.
      // reabrir una cola con argumentos distintos a los que ya tiene, un
      // 406 PRECONDITION-FAILED) cierra el canal y emite 'error' ahí. Sin
      // un listener registrado ANTES de la siguiente operación, Node trata
      // ese evento como no manejado y tumba el proceso entero — se
      // descubrió al chocar justo con ese caso en un ambiente real.
      this.canal.on('error', (error: Error) =>
        this.logger.warn(`Error en el canal de RabbitMQ: ${error.message}`),
      );

      await this.canal.assertQueue(COLA_CAMBIOS_TURNO_DLQ, { durable: true });
      await this.canal.assertQueue(COLA_CAMBIOS_TURNO, { durable: true, arguments: ARGUMENTOS_COLA });
      this.logger.log(`Conectado a RabbitMQ (${this.url}), cola "${COLA_CAMBIOS_TURNO}" lista.`);
    } catch (error) {
      this.logger.warn(
        `No se pudo conectar a RabbitMQ en ${this.url}. Los eventos de cambio de turno no se publicarán hasta que esté disponible. (${(error as Error).message})`,
      );
    }
  }

  private reconectarSiHaceFalta() {
    if (this.cerrando) return;
    this.canal = null;
    this.conexion = null;
    this.logger.warn('Conexión a RabbitMQ perdida; reintentando en segundo plano.');
    void this.conectar();
  }

  async onModuleDestroy() {
    this.cerrando = true;
    await this.canal?.close();
    await this.conexion?.close();
  }

  async publicarCambioTurno(evento: Omit<CambioTurnoEvento, 'tipo' | 'publicadoEn' | 'id'>) {
    if (!this.canal) {
      this.logger.warn('Canal de RabbitMQ no disponible; se omite la publicación del evento.');
      return;
    }
    const mensaje: CambioTurnoEvento = {
      id: randomUUID(),
      tipo: 'TURNO_CAMBIADO',
      ...evento,
      publicadoEn: new Date().toISOString(),
    };
    this.canal.sendToQueue(COLA_CAMBIOS_TURNO, Buffer.from(JSON.stringify(mensaje)), {
      persistent: true,
    });
  }
}
