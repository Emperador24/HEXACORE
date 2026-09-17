import { Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { EntradaTransferida } from './entrada-transferida.evento';
import { MAXIMO_INTENTOS, VERSION_ENTRADA_TRANSFERIDA } from './topologia';

/**
 * Base de los consumidores de `ENTRADA_TRANSFERIDA`.
 *
 * Concentra lo que los dos consumidores tienen que hacer igual —y que es fácil
 * hacer mal—: contar reintentos, mandar a la DLQ lo que no se puede procesar y
 * descartar duplicados. Cada consumidor concreto solo escribe su `procesar`.
 *
 * ## Las tres formas de terminar un mensaje
 *
 * - **`ack`** — procesado, o descartado a conciencia (duplicado). Se va de la cola.
 * - **`nack(requeue: false)`** — no se puede procesar y no mejorará reintentando:
 *   el broker lo manda a la DLQ. Es lo que ADR-10 valoró de RabbitMQ frente a
 *   Kafka, donde habría que construirlo a mano.
 * - **`nack(requeue: true)`** — fallo transitorio; vuelve a la cola para otro
 *   intento.
 *
 * El error clásico aquí es reencolar siempre: un mensaje que falla por su
 * contenido —un JSON roto, una versión desconocida— volvería a la cola para
 * siempre, girando en bucle y tapando a los demás. Por eso se distingue entre
 * "esto no se puede procesar nunca" (DLQ inmediata) y "esto falló ahora"
 * (reintento acotado).
 */
export abstract class ConsumidorEntradaTransferida implements OnApplicationBootstrap, OnApplicationShutdown {
  protected abstract readonly log: Logger;
  /** Cola de la que lee este consumidor. */
  protected abstract readonly cola: string;

  /** Qué hace este consumidor con el evento. Lanzar significa "reintentar". */
  protected abstract procesar(evento: EntradaTransferida): Promise<void>;

  /**
   * Eventos ya procesados, para descartar duplicados.
   *
   * RabbitMQ entrega **al menos una vez**: si el consumidor procesa un mensaje
   * y se cae antes de confirmarlo, el broker lo entrega otra vez. Sin esta
   * comprobación se enviarían dos correos, o peor, se pagaría dos veces al
   * vendedor.
   *
   * En memoria, y por tanto **se pierde al reiniciar**: es suficiente para el
   * prototipo pero no para producción, donde la marca de procesado tendría que
   * vivir en la base de datos del consumidor. Anotado en DECISIONES.md §9.
   */
  private readonly procesados = new Set<string>();

  /**
   * Intentos fallidos por evento.
   *
   * Hace falta un contador propio porque **RabbitMQ no cuenta los reintentos
   * de un `nack(requeue: true)`**: la cabecera `x-death` solo aparece cuando un
   * mensaje ha pasado por la cola de muertos, y `redelivered` es un booleano
   * que dice "ya se entregó antes", no cuántas veces.
   *
   * Sin este contador, un mensaje que siempre falla vuelve a la cola una y otra
   * vez sin llegar nunca al límite: rebota para siempre y, con `prefetch(1)`,
   * bloquea a los que vienen detrás. Es el bucle infinito que esta clase decía
   * evitar y que solo se destapó al probar con eventos que fallan de verdad.
   */
  private readonly intentos = new Map<string, number>();

  private etiquetaConsumidor: string | null = null;
  private cerrando = false;

  protected constructor(protected readonly conexion: ConexionRabbitMq) {}

  /**
   * `onApplicationBootstrap` y no `onModuleInit`: Nest garantiza que este gancho
   * corre cuando **todos** los `onModuleInit` han terminado, incluido el de
   * `ConexionRabbitMq`. Con `onModuleInit` los consumidores se adelantaban a la
   * conexión, encontraban el canal a medio abrir y quedaban esperando cinco
   * segundos al reintento — un arranque con la cola sin consumir para nada.
   */
  async onApplicationBootstrap(): Promise<void> {
    // Además de suscribirse ahora, se apunta para volver a hacerlo cada vez que
    // la conexión se rehaga: un canal nuevo no conserva las suscripciones del
    // anterior, así que sin esto el consumidor quedaría mudo tras la primera
    // caída del broker.
    this.conexion.registrarAlReconectar(() => this.suscribir());
    await this.suscribir();
  }

  private async suscribir(): Promise<void> {
    if (this.cerrando) return;
    const canal = this.conexion.obtenerCanal();

    if (!canal) {
      // El broker aún no está. La conexión se reintenta sola; se vuelve a
      // mirar dentro de un momento en vez de dar el consumidor por perdido.
      const reintento = setTimeout(() => void this.suscribir(), 5000);
      reintento.unref();
      return;
    }

    // `prefetch(1)`: un mensaje a la vez por consumidor. Estos trabajos son
    // cortos y de baja frecuencia —una reventa no ocurre mil veces por
    // segundo—, así que el rendimiento no es la preocupación; poder razonar
    // sobre el orden y no acumular mensajes sin confirmar, sí.
    await canal.prefetch(1);

    // El canal pudo cambiar desde la última suscripción; la etiqueta anterior
    // ya no vale para nada y se descarta sin intentar cancelarla.
    this.etiquetaConsumidor = null;

    const { consumerTag } = await canal.consume(this.cola, (mensaje) => {
      // El `catch` no es decorativo: sin él, cualquier excepción que escape de
      // `recibir` —incluida la de un `ack` sobre un canal ya cerrado— queda
      // como promesa rechazada sin manejador y, en Node ≥ 15, **mata el
      // proceso**. Reiniciar RabbitMQ tumbaría el servicio de entradas entero.
      if (mensaje) {
        this.recibir(mensaje).catch((error: unknown) => {
          this.log.error(
            `Fallo no controlado procesando un mensaje de ${this.cola}: ` +
              `${error instanceof Error ? error.message : error}`,
          );
        });
      }
    });
    this.etiquetaConsumidor = consumerTag;
    this.log.log(`Escuchando ${this.cola}`);
  }

  /**
   * Confirma o rechaza un mensaje tolerando que el canal haya muerto mientras
   * se procesaba.
   *
   * El canal se vuelve a pedir en el momento de usarlo, no se reutiliza el que
   * había al empezar: entre una cosa y otra el broker pudo caerse, y operar
   * sobre un canal cerrado lanza `IllegalOperationError`.
   *
   * Si el canal ya no está, no hay nada que hacer y tampoco nada que lamentar:
   * el mensaje no se confirmó, así que RabbitMQ lo volverá a entregar cuando el
   * consumidor se resuscriba. Esa reentrega es precisamente el motivo de que
   * los consumidores descarten duplicados.
   */
  private cerrar(mensaje: ConsumeMessage, accion: 'ack' | 'dlq' | 'reintentar'): void {
    const canal = this.conexion.obtenerCanal();
    if (!canal) {
      this.log.warn(`Canal caído al cerrar un mensaje de ${this.cola}; se reentregará`);
      return;
    }
    try {
      if (accion === 'ack') canal.ack(mensaje);
      else canal.nack(mensaje, false, accion === 'reintentar');
    } catch (error) {
      this.log.warn(
        `No se pudo ${accion} un mensaje de ${this.cola} (canal cerrado): ` +
          `${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async recibir(mensaje: ConsumeMessage): Promise<void> {

    let evento: EntradaTransferida;
    try {
      evento = JSON.parse(mensaje.content.toString()) as EntradaTransferida;
    } catch {
      // Un JSON ilegible no se arregla reintentando: a la DLQ directamente.
      this.log.error(`Mensaje ilegible en ${this.cola}; va a la DLQ`);
      this.cerrar(mensaje, 'dlq');
      return;
    }

    if (evento.version !== VERSION_ENTRADA_TRANSFERIDA) {
      // Una versión que no entendemos tampoco mejora con el tiempo. Se manda a
      // la DLQ en vez de interpretarla a medias, que es lo que el propio
      // contrato en `shared/` indica.
      this.log.error(
        `Versión ${evento.version} desconocida en ${this.cola} (se espera ${VERSION_ENTRADA_TRANSFERIDA}); va a la DLQ`,
      );
      this.cerrar(mensaje, 'dlq');
      return;
    }

    if (this.procesados.has(evento.id)) {
      this.log.warn(`Evento ${evento.transferencia.numeroTransaccion} repetido; se descarta`);
      this.cerrar(mensaje, 'ack');
      return;
    }

    try {
      await this.procesar(evento);
      this.procesados.add(evento.id);
      this.intentos.delete(evento.id);
      this.cerrar(mensaje, 'ack');
    } catch (error) {
      const causa = error instanceof Error ? error.message : String(error);
      const fallos = (this.intentos.get(evento.id) ?? 0) + 1;
      this.intentos.set(evento.id, fallos);

      if (fallos >= MAXIMO_INTENTOS) {
        this.log.error(
          `${this.cola}: ${evento.transferencia.numeroTransaccion} falló ${fallos} veces (${causa}); va a la DLQ`,
        );
        this.intentos.delete(evento.id);
        this.cerrar(mensaje, 'dlq');
        return;
      }

      this.log.warn(
        `${this.cola}: ${evento.transferencia.numeroTransaccion} falló (${causa}); intento ${fallos} de ${MAXIMO_INTENTOS}`,
      );
      this.cerrar(mensaje, 'reintentar');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.cerrando = true;
    const canal = this.conexion.obtenerCanal();
    if (canal && this.etiquetaConsumidor) {
      try {
        // Cancelar la suscripción antes de cerrar deja terminar el mensaje en
        // curso en vez de cortarlo a medias y forzar un reintento innecesario.
        await canal.cancel(this.etiquetaConsumidor);
      } catch {
        // El canal ya puede estar cerrado; no hay nada que rescatar.
      }
    }
  }
}
