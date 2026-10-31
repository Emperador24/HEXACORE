import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { connect, ChannelModel, ConfirmChannel } from 'amqplib';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

/** Declaración de exchanges y colas de un módulo. Debe ser idempotente. */
export type DeclararTopologia = (canal: ConfirmChannel) => Promise<void>;

/**
 * Conexión a RabbitMQ de Pagos (ADR-10, ADR-15).
 *
 * Copia de la de Alimentos, con sus dos arreglos que costaron un fallo cada
 * uno: los manejadores de cierre del canal (sin ellos el servicio quedaba
 * "conectado" pero mudo) y la resuscripción al reconectar. Es una copia y no
 * una librería compartida a propósito: cada servicio se despliega solo, y una
 * dependencia común los obligaría a desplegarse juntos al cambiarla.
 *
 * Pagos solo publica —`PagoAprobado` / `PagoRechazado`—; no consume nada.
 *
 * ## Por qué Pagos arranca aunque RabbitMQ no esté
 *
 * Cobrar no depende del broker: Ventas, Postventa y Alimentos siguen
 * recibiendo la respuesta del cobro por HTTP. Lo que depende del broker es
 * avisar del resultado confirmado por el webhook, y ese aviso no se pierde si
 * el broker cae: el webhook responde 503 y la pasarela lo reintenta.
 */
@Injectable()
export class ConexionRabbitMq implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ConexionRabbitMq.name);
  private readonly url: string;

  private conexion: ChannelModel | null = null;
  private canal: ConfirmChannel | null = null;
  private reintento: NodeJS.Timeout | null = null;
  private cerrando = false;

  /** Topologías de los módulos. Se declaran en cada canal nuevo. */
  private readonly topologias: DeclararTopologia[] = [];

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

  /**
   * Registra la topología de un módulo. Se invoca desde su `onModuleInit`,
   * antes de que esta clase abra la conexión.
   */
  registrarTopologia(declarar: DeclararTopologia): void {
    this.topologias.push(declarar);
  }

  /**
   * Registra un trabajo que debe rehacerse cada vez que haya canal nuevo
   * —típicamente, volver a suscribirse a una cola—.
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

  async onApplicationBootstrap(): Promise<void> {
    await this.conectar();
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

      await this.declararTopologias(this.canal);

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
      // publicador y los consumidores quedarían mudos para siempre.
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

      this.log.log(`Conectado a RabbitMQ; ${this.topologias.length} topologías declaradas`);

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

  /**
   * Declara la topología de cada módulo sobre el canal nuevo.
   *
   * Si la de un módulo falla, se registra y se sigue con las demás: que la cola
   * de correos no se pueda declarar no es razón para dejar a Pedidos sin su
   * exchange.
   */
  private async declararTopologias(canal: ConfirmChannel): Promise<void> {
    for (const declarar of this.topologias) {
      try {
        await declarar(canal);
      } catch (error) {
        this.log.error(`Fallo al declarar una topología: ${error instanceof Error ? error.message : error}`);
      }
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
    this.canal = null;
    this.conexion = null;
  }
}
