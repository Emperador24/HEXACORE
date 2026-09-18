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
import { COLA_CAMBIOS_TURNO_DLQ, MAXIMO_INTENTOS } from './eventos-topologia.js';
import { conectarConReintento } from './rabbitmq-conexion.util.js';

const ARGUMENTOS_COLA = {
  'x-dead-letter-exchange': '',
  'x-dead-letter-routing-key': COLA_CAMBIOS_TURNO_DLQ,
};

/**
 * Consumidor de la cola "turnos.cambios". Representa el módulo de
 * notificaciones que reacciona de forma asíncrona a un cambio de turno
 * aprobado; persiste la evidencia (Notificacion) para poder demostrar en
 * vivo la latencia real de publicación→consumo en la sustentación.
 *
 * ## Las tres formas de terminar un mensaje (ADR-10)
 *
 * - `ack` — procesado, o descartado a conciencia (duplicado).
 * - `nack(requeue: false)` — agotó los reintentos: el broker lo manda solo
 *   a la DLQ (`x-dead-letter-*` en la cola), sin construir nada a mano.
 * - `nack(requeue: true)` — fallo transitorio; vuelve a la cola.
 *
 * Antes este consumidor hacía `ack` siempre: si guardar la `Notificacion`
 * fallaba, el mensaje se daba por procesado y se perdía en silencio — es
 * justo lo que ADR-10 dijo que RabbitMQ evitaba frente a Kafka.
 */
@Injectable()
export class EventosConsumidorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventosConsumidorService.name);
  private conexion: amqplib.ChannelModel | null = null;
  private canal: amqplib.Channel | null = null;
  private cerrando = false;
  private url = '';

  /**
   * Eventos ya procesados, para descartar duplicados (RabbitMQ entrega *al
   * menos una vez*). En memoria — se pierde al reiniciar, suficiente para
   * el prototipo pero no para producción (la marca debería vivir en BD).
   */
  private readonly procesados = new Set<string>();

  /**
   * Intentos fallidos por evento. Hace falta un contador propio porque
   * RabbitMQ no cuenta los reintentos de un `nack(requeue: true)` — sin
   * esto un mensaje que siempre falla rebotaría para siempre.
   */
  private readonly intentos = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Notificacion)
    private readonly notificaciones: Repository<Notificacion>,
  ) {}

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
      this.conexion.once('close', () => this.reconectarSiHaceFalta());
      this.conexion.once('error', () => this.reconectarSiHaceFalta());

      this.canal = await this.conexion.createChannel();
      // Ver el mismo comentario en EventosPublicadorService: sin este
      // listener, un error de protocolo en el canal (cola reabierta con
      // argumentos distintos, un 406) tumba el proceso entero.
      this.canal.on('error', (error: Error) =>
        this.logger.warn(`Error en el canal de RabbitMQ: ${error.message}`),
      );

      await this.canal.prefetch(1);
      await this.canal.assertQueue(COLA_CAMBIOS_TURNO_DLQ, { durable: true });
      await this.canal.assertQueue(COLA_CAMBIOS_TURNO, { durable: true, arguments: ARGUMENTOS_COLA });
      await this.canal.consume(COLA_CAMBIOS_TURNO, (msg) => void this.procesar(msg));
      this.logger.log(`Escuchando la cola "${COLA_CAMBIOS_TURNO}".`);
    } catch (error) {
      this.logger.warn(
        `No se pudo conectar el consumidor a RabbitMQ. (${(error as Error).message})`,
      );
    }
  }

  private reconectarSiHaceFalta() {
    if (this.cerrando) return;
    this.canal = null;
    this.conexion = null;
    this.logger.warn('Conexión del consumidor a RabbitMQ perdida; reintentando en segundo plano.');
    void this.conectar();
  }

  async onModuleDestroy() {
    this.cerrando = true;
    await this.canal?.close();
    await this.conexion?.close();
  }

  private async procesar(msg: amqplib.ConsumeMessage | null) {
    if (!msg || !this.canal) {
      return;
    }
    const evento = JSON.parse(msg.content.toString()) as CambioTurnoEvento;

    if (this.procesados.has(evento.id)) {
      this.canal.ack(msg);
      return;
    }

    try {
      // Publicador y consumidor pueden correr en procesos/máquinas distintas
      // (host vs. contenedor); un desfase de reloj de pocos milisegundos
      // entre ambos es normal y puede dar una resta negativa — no es una
      // violación de causalidad real, así que se acota a 0.
      const latenciaMs = Math.max(0, Date.now() - new Date(evento.publicadoEn).getTime());

      const notificacion = this.notificaciones.create({
        tipo: evento.tipo,
        turnoId: evento.turnoId,
        empleadoId: evento.empleadoNuevoId,
        mensaje: `Se te asignó el turno ${evento.turnoId} por cambio aprobado.`,
        latenciaMs,
      });
      await this.notificaciones.save(notificacion);

      this.procesados.add(evento.id);
      this.intentos.delete(evento.id);
      this.canal.ack(msg);
    } catch (error) {
      const intentosPrevios = this.intentos.get(evento.id) ?? 0;
      const intentosTotales = intentosPrevios + 1;
      this.intentos.set(evento.id, intentosTotales);

      if (intentosTotales >= MAXIMO_INTENTOS) {
        this.logger.error(
          `Evento ${evento.id} agotó ${MAXIMO_INTENTOS} intentos, se envía a la DLQ. (${(error as Error).message})`,
        );
        this.intentos.delete(evento.id);
        this.canal.nack(msg, false, false); // a la DLQ, no se reencola.
      } else {
        this.logger.warn(
          `Evento ${evento.id} falló (intento ${intentosTotales}/${MAXIMO_INTENTOS}), se reintenta. (${(error as Error).message})`,
        );
        this.canal.nack(msg, false, true); // fallo transitorio, se reencola.
      }
    }
  }
}
