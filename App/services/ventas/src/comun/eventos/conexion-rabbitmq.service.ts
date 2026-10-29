import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { connect, ChannelModel, ConfirmChannel } from 'amqplib';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import { COLAS, CLAVE_ENTRADA_TRANSFERIDA, EXCHANGE_MUERTOS, EXCHANGE_REVENTA, colaMuertos } from './topologia';

/**
 * Conexión a RabbitMQ y declaración de la topología (ADR-10).
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
 * servicio sigue en pie. La razón está en el propio CU-006: publicar el evento
 * es el paso **12**, *después* de que la transferencia ya se escribió en la
 * base. Negarse a arrancar por un broker caído impediría vender entradas por un
 * fallo en algo que solo manda correos — exactamente el acoplamiento que ADR-04
 * quería evitar.
 *
 * Lo que sí hace es dejar constancia: un evento que no se pudo publicar se
 * registra como error, porque ASR-07 exige que la auditoría no pierda nada en
 * silencio.
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
    // `durable: true` en todo: sobreviven al reinicio del broker. El PoC-05 fue
    // explícito — "ni una transferencia de entrada ni una alerta de evacuación
    // pueden perderse porque el broker se reinició".
    await canal.assertExchange(EXCHANGE_REVENTA, 'topic', { durable: true });
    await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });

    for (const cola of Object.values(COLAS)) {
      const muertos = colaMuertos(cola);

      // La DLQ se declara primero: si la cola de trabajo apuntara a un exchange
      // cuyo destino no existe, los mensajes rechazados se perderían en vez de
      // quedar guardados.
      await canal.assertQueue(muertos, { durable: true });
      await canal.bindQueue(muertos, EXCHANGE_MUERTOS, cola);

      // `x-dead-letter-exchange` es la DLQ nativa que ADR-10 valoró frente a
      // Kafka: bastan estas dos líneas y un `nack(requeue: false)` para que el
      // broker mueva el mensaje solo.
      await canal.assertQueue(cola, {
        durable: true,
        deadLetterExchange: EXCHANGE_MUERTOS,
        deadLetterRoutingKey: cola,
      });
      await canal.bindQueue(cola, EXCHANGE_REVENTA, CLAVE_ENTRADA_TRANSFERIDA);
    }
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
