import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { InjectRepository } from '@nestjs/typeorm';
import * as amqplib from 'amqplib';
import { Repository } from 'typeorm';
import { Notificacion } from './entities/notificacion.entity';
import { CambioTurnoEvento, COLA_CAMBIOS_TURNO } from './eventos-publicador.service';
import { COLA_CAMBIOS_TURNO_DLQ, MAXIMO_INTENTOS } from './eventos-topologia';

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
  private canal: amqplib.Channel | null = null;
  private cerrando = false;
  private etiqueta?: string;
  private readonly enCurso = new Set<Promise<void>>();

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
    private readonly conexion: ConexionRabbitMq,
    @InjectRepository(Notificacion, CONEXION_LOGISTICA)
    private readonly notificaciones: Repository<Notificacion>,
  ) {}

  onModuleInit(): void {
    this.conexion.registrarAlReconectar(() => this.suscribir());
  }

  private async suscribir(): Promise<void> {
    if (this.cerrando) return;
    const canal = this.conexion.obtenerCanal();
    if (!canal) return;
    this.canal = canal;
    await canal.prefetch(1);
    const { consumerTag } = await canal.consume(COLA_CAMBIOS_TURNO, (msg) => {
      const trabajo = this.procesar(msg);
      this.enCurso.add(trabajo);
      void trabajo.finally(() => this.enCurso.delete(trabajo)).catch((error: Error) => {
        this.logger.error(`Mensaje de logística no procesado: ${error.message}`);
      });
    });
    this.etiqueta = consumerTag;
    this.logger.log(`Escuchando la cola "${COLA_CAMBIOS_TURNO}".`);
  }

  async onModuleDestroy(): Promise<void> {
    this.cerrando = true;
    if (this.canal && this.etiqueta) await this.canal.cancel(this.etiqueta);
    await Promise.all([...this.enCurso]);
    this.logger.log('Consumidor de logística detenido');
    // La conexión y el canal compartidos se cierran después, por su propietario.
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
        mensaje: evento.mensaje,
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
