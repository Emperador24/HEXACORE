import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleDestroy } from '@nestjs/common';
import { connect, ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CONFIGURACION_PROCESO, ConfiguracionProceso } from '../config/configuracion';

/** Declaración de exchanges y colas de un módulo. Debe ser idempotente. */
export type DeclararTopologia = (canal: ConfirmChannel) => Promise<void>;

/**
 * Conexión a RabbitMQ del Núcleo (ADR-10).
 *
 * Antes de ADR-12 esta clase estaba **duplicada** en Administración y en
 * Pedidos: dos conexiones al mismo broker desde dos procesos. En un solo
 * proceso hay una, y cada módulo le registra su propia topología —la de
 * cuentas y la de pedidos siguen siendo independientes, comparten broker y
 * nada más: si la cola de correos se atasca, los eventos de pedido siguen
 * saliendo—.
 *
 * Se conserva el diseño de Administración, que era el completo, **incluidos
 * los dos arreglos que allí costaron un fallo cada uno**: los manejadores de
 * cierre del canal (sin ellos el servicio quedaba "conectado" pero mudo) y la
 * resuscripción de los consumidores al reconectar (un canal nuevo no conserva
 * las suscripciones del anterior).
 *
 * ## Por qué la topología se declara desde el código
 *
 * `assertExchange` y `assertQueue` son idempotentes: si ya existen con la
 * misma configuración, no hacen nada. Declararlas al arrancar significa que
 * levantar el sistema en una máquina nueva no requiere entrar a la consola de
 * RabbitMQ a crear cosas a mano, y que la topología está versionada en git
 * junto al código que la usa.
 *
 * ## Por qué el Núcleo arranca aunque RabbitMQ no esté
 *
 * Si la conexión falla, se registra y se reintenta en segundo plano, pero el
 * proceso sigue en pie. El CU-027 marca la Disponibilidad del login como
 * atributo de calidad, y negarse a arrancar por un broker caído dejaría a
 * **todo el sistema sin poder iniciar sesión** por un fallo en algo que solo
 * manda correos. El coste asumido es que, con el broker caído, los correos de
 * verificación no salen; queda registrado como error (DECISIONES.md §10).
 *
 * ## Por qué conecta en `onApplicationBootstrap` y no en `onModuleInit`
 *
 * Los módulos registran su topología durante su `onModuleInit`, que Nest
 * ejecuta antes. Conectar más tarde garantiza que, cuando se abre el canal, ya
 * están registradas **todas** las topologías; si conectara en `onModuleInit`,
 * declararía solo las de los módulos que hubieran corrido antes que este.
 */
@Injectable()
export class ConexionRabbitMq implements OnApplicationBootstrap, OnApplicationShutdown, OnModuleDestroy {
  private readonly log = new Logger(ConexionRabbitMq.name);
  private readonly url: string;
  private readonly nombre: string;

  private conexion: ChannelModel | null = null;
  private canal: ConfirmChannel | null = null;
  private reintento: NodeJS.Timeout | null = null;
  private cerrando = false;
  private readonly consumidores = new Map<string, ConfirmChannel>();
  private readonly trabajos = new Set<Promise<unknown>>();

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

  constructor(@Inject(CONFIGURACION_PROCESO) config: ConfiguracionProceso) {
    this.url = config.rabbitmq.url;
    this.nombre = `hexacore-${config.programa || 'nucleo'}`;
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

  /** Suscripciones cuyo trabajo debe terminar antes de cerrar las bases. */
  async consumir(cola: string, recibir: (mensaje: ConsumeMessage | null) => unknown) {
    const canal = this.canal;
    if (!canal || this.cerrando) throw new Error('Canal no disponible para consumir');
    const resultado = await canal.consume(cola, (mensaje) => {
      const trabajo = Promise.resolve().then(() => recibir(mensaje));
      this.trabajos.add(trabajo);
      void trabajo.finally(() => this.trabajos.delete(trabajo)).catch((error: Error) =>
        this.log.error(`Fallo de consumo en ${cola}: ${error.message}`));
    });
    this.consumidores.set(resultado.consumerTag, canal);
    return resultado;
  }

  async cancelarConsumo(etiqueta: string): Promise<void> {
    const canal = this.consumidores.get(etiqueta);
    this.consumidores.delete(etiqueta);
    if (canal) await canal.cancel(etiqueta).catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.cerrando = true;
    if (this.reintento) clearTimeout(this.reintento);
    for (const etiqueta of [...this.consumidores.keys()]) await this.cancelarConsumo(etiqueta);
    await Promise.allSettled([...this.trabajos]);
    this.log.log('Consumos AMQP detenidos; pendientes=0');
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
      this.conexion = await connect(this.url, { clientProperties: { connection_name: this.nombre } });

      // Canal *confirm* y no uno normal: es lo que permite saber si el broker
      // guardó realmente el mensaje. Sin confirmaciones, `publish` devuelve
      // true en cuanto el mensaje sale del proceso, y un evento perdido en ese
      // hueco no se detectaría nunca. Es la mitad "publisher confirms" del modo
      // duradero que midió el PoC-05.
      this.canal = await this.conexion.createConfirmChannel();

      await this.declararTopologias(this.canal);

      this.conexion.on('error', (error: Error) => this.log.error(`Error de conexión: ${error.message}`));
      this.conexion.on('close', () => {
        this.consumidores.clear();
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

      // Los consumidores se suscriben al primer canal y a cada reconexión,
      // después de declarar todas las topologías.
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
