import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { connect, ChannelModel, ConfirmChannel } from 'amqplib';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import {
  CLAVE_CORREO_PENDIENTE,
  COLA_CORREOS,
  COLA_CORREOS_DLQ,
  EXCHANGE_CUENTAS,
  EXCHANGE_MUERTOS,
} from './topologia';

/**
 * Conexión a RabbitMQ y declaración de la topología (ADR-10).
 *
 * Es el mismo diseño que el del servicio de Entradas, **incluidos los dos
 * arreglos que allí costaron un fallo cada uno**: los manejadores de cierre del
 * canal (sin ellos el servicio quedaba "conectado" pero mudo) y la
 * resuscripción de los consumidores al reconectar (un canal nuevo no conserva
 * las suscripciones del anterior).
 *
 * ## Por qué la topología se declara desde el código
 *
 * `assertExchange` y `assertQueue` son idempotentes: si ya existen con la misma
 * configuración, no hacen nada. Declararlas al arrancar significa que levantar
 * el sistema en una máquina nueva no requiere entrar a la consola de RabbitMQ a
 * crear cosas a mano, y que la topología está versionada en git junto al código
 * que la usa.
 *
 * ## Por qué el servicio arranca aunque RabbitMQ no esté
 *
 * Si la conexión falla, se registra y se reintenta en segundo plano, pero el
 * servicio sigue en pie. El motivo aquí es aún más fuerte que en el CU-006: el
 * CU-027 marca la Disponibilidad del login como atributo de calidad, y negarse
 * a arrancar por un broker caído dejaría a **todo el sistema sin poder iniciar
 * sesión** por un fallo en algo que solo manda correos.
 *
 * El coste asumido es que, con el broker caído, los correos de verificación no
 * salen. Queda registrado como error; ver DECISIONES.md §10.
 */
@Injectable()
export class ConexionRabbitMq implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(ConexionRabbitMq.name);
  private readonly url: string;

  private conexion: ChannelModel | null = null;
  private canal: ConfirmChannel | null = null;
  private reintento: NodeJS.Timeout | null = null;
  private cerrando = false;

  /**
   * A quién avisar cuando haya un canal nuevo.
   *
   * Cada reconexión crea un canal distinto, y las suscripciones del canal
   * anterior mueren con él. Sin este aviso, tras una caída del broker el
   * servicio reconectaría —la sonda diría "rabbitmq: arriba"— pero **nadie
   * volvería a consumir**: las notificaciones y las liquidaciones se
   * acumularían en las colas sin que nada lo delatara.
   *
   * Lo descubrió la prueba `cu006-eventos-cola.py` al reiniciar el broker.
   */
  private readonly alReconectar: (() => Promise<void>)[] = [];

  constructor(@Inject(CONFIGURACION) config: ConfiguracionServicio) {
    this.url = config.rabbitmq.url;
  }

  async onModuleInit(): Promise<void> {
    await this.conectar();
  }

  /**
   * Registra un trabajo que debe rehacerse cada vez que haya canal nuevo
   * —típicamente, volver a suscribirse a una cola—. Se invoca también si en el
   * momento de registrarse ya hay canal.
   */
  registrarAlReconectar(accion: () => Promise<void>): void {
    this.alReconectar.push(accion);
  }

  /** Canal listo para publicar, o null si el broker no está disponible ahora mismo. */
  obtenerCanal(): ConfirmChannel | null {
    return this.canal;
  }

  get conectado(): boolean {
    return this.canal !== null;
  }

  private async conectar(): Promise<void> {
    if (this.cerrando) return;
    try {
      this.conexion = await connect(this.url);

      // Canal *confirm* y no uno normal: es lo que permite saber si el broker
      // guardó realmente el mensaje. Sin confirmaciones, `publish` devuelve
      // true en cuanto el mensaje sale del proceso, y un evento perdido en ese
      // hueco no se detectaría nunca. Es la mitad "publisher confirms" del modo
      // duradero que midió el PoC-05.
      this.canal = await this.conexion.createConfirmChannel();

      await this.declararTopologia(this.canal);

      this.conexion.on('error', (error: Error) => this.log.error(`Error de conexión: ${error.message}`));
      this.conexion.on('close', () => {
        this.canal = null;
        this.conexion = null;
        if (!this.cerrando) {
          this.log.warn('Conexión con RabbitMQ cerrada; reintentando');
          this.programarReintento();
        }
      });

      // El canal necesita sus propios manejadores, además de los de la
      // conexión.
      //
      // En AMQP un error de nivel canal —declarar una cola con argumentos
      // incompatibles, publicar a un exchange que no existe, confirmar un
      // mensaje con una etiqueta inválida— cierra **solo el canal** y deja la
      // conexión viva. Sin esto, `this.canal` seguiría apuntando a un canal
      // muerto: `conectado` diría `true`, la sonda de salud mentiría, el
      // reintento no se dispararía nunca porque la conexión no se cerró, y el
      // publicador y los dos consumidores quedarían mudos para siempre.
      this.canal.on('error', (error: Error) => this.log.error(`Error de canal: ${error.message}`));
      this.canal.on('close', () => {
        if (this.cerrando) return;
        this.log.warn('Canal de RabbitMQ cerrado; se rehace la conexión');
        this.canal = null;
        // Se cierra también la conexión para reconstruirlo todo desde cero: así
        // el camino de recuperación es uno solo —el de `close` de conexión— en
        // vez de dos que podrían pisarse.
        void this.conexion?.close().catch(() => undefined);
      });

      this.log.log('Conectado a RabbitMQ; topología declarada');

      // Los consumidores se resuscriben sobre el canal nuevo. En el primer
      // arranque la lista está vacía y esto no hace nada; en una reconexión es
      // lo que devuelve la vida a las colas.
      for (const accion of this.alReconectar) {
        try {
          await accion();
        } catch (error) {
          this.log.error(`Fallo al resuscribir un consumidor: ${error instanceof Error ? error.message : error}`);
        }
      }
    } catch (error) {
      this.canal = null;
      this.conexion = null;
      const causa = error instanceof Error ? error.message : String(error);
      this.log.error(`No se pudo conectar a RabbitMQ: ${causa}`);
      this.programarReintento();
    }
  }

  private programarReintento(): void {
    if (this.reintento || this.cerrando) return;
    this.reintento = setTimeout(() => {
      this.reintento = null;
      void this.conectar();
    }, 5000);
    // `unref` para que este temporizador no mantenga vivo el proceso: sin él,
    // el servicio no terminaría nunca al recibir SIGTERM (RNF-15).
    this.reintento.unref();
  }

  /** Crea exchanges y colas. Idempotente: se puede llamar en cada arranque. */
  private async declararTopologia(canal: ConfirmChannel): Promise<void> {
    // `durable: true`: un correo de verificación pendiente no puede perderse
    // porque el broker se reiniciara. Quien se registró estaría esperándolo.
    await canal.assertExchange(EXCHANGE_CUENTAS, 'topic', { durable: true });
    await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });

    // La DLQ primero: si la cola de trabajo apuntara a un exchange sin destino,
    // los mensajes rechazados se perderían en vez de quedar guardados.
    await canal.assertQueue(COLA_CORREOS_DLQ, { durable: true });
    await canal.bindQueue(COLA_CORREOS_DLQ, EXCHANGE_MUERTOS, COLA_CORREOS);

    await canal.assertQueue(COLA_CORREOS, {
      durable: true,
      deadLetterExchange: EXCHANGE_MUERTOS,
      deadLetterRoutingKey: COLA_CORREOS,
    });
    await canal.bindQueue(COLA_CORREOS, EXCHANGE_CUENTAS, CLAVE_CORREO_PENDIENTE);
  }

  async onApplicationShutdown(): Promise<void> {
    this.cerrando = true;
    if (this.reintento) clearTimeout(this.reintento);
    try {
      // Cerrar el canal antes que la conexión da tiempo a que las
      // confirmaciones en vuelo lleguen, en vez de cortarlas a media publicación.
      await this.canal?.close();
      await this.conexion?.close();
    } catch (error) {
      this.log.warn(`Cierre de RabbitMQ con incidencias: ${error instanceof Error ? error.message : error}`);
    }
  }
}
