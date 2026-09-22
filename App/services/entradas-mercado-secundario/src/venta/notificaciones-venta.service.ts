import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ConexionRabbitMq } from '../reventa/eventos/conexion-rabbitmq.service';
import { MAXIMO_INTENTOS } from '../reventa/eventos/topologia';

/** Exchange de los hechos de la venta primaria. Aparte del de la reventa: son dos dominios de eventos. */
export const EXCHANGE_VENTAS = 'ventas.eventos';
export const EXCHANGE_VENTAS_MUERTOS = 'ventas.muertos';
export const COLA_NOTIFICACIONES_VENTA = 'ventas.notificaciones';

export type TipoEventoVenta = 'COMPRA_CONFIRMADA' | 'COMPRA_CANCELADA';

/**
 * Hecho de la venta primaria que hay que comunicar al cliente.
 *
 * - `COMPRA_CONFIRMADA`: paso 8 del CU-001 (*"Enviar confirmación y boletos por correo"*).
 * - `COMPRA_CANCELADA`: paso 9 del CU-003 (*"Notifica al cliente sobre la cancelación y el reembolso"*).
 */
export interface EventoVenta {
  /** Identificador único del hecho: es lo que permite descartar duplicados. */
  id: string;
  tipo: TipoEventoVenta;
  version: 1;
  ocurridoEn: string;
  clienteId: string;
  numeroCompra: string;
  eventoNombre: string;
  /** Tickets afectados: los emitidos o los anulados. */
  entradas: { numeroTicket: string; localidadNombre: string; codigoQr?: string }[];
  /** Total cobrado, o monto reembolsado. */
  monto: number;
}

/**
 * Publica y consume los eventos de la venta primaria (ADR-10).
 *
 * Las dos fichas lo piden igual: el CU-001 quiere la cola *"para desacoplar la
 * generación del QR y el envío del correo de confirmación del flujo de pago"*,
 * y el CU-003 *"para desacoplar la notificación al cliente del procesamiento
 * del reembolso"*. La compra se confirma en cuanto se escribe en la base; el
 * correo sale después, y si el broker está caído la compra **no** falla.
 *
 * Reutiliza la conexión de la reventa (`ConexionRabbitMq`) pero declara su
 * propia topología: un exchange y una cola con su DLQ. Aplica las lecciones que
 * `consumidor-base.ts` dejó documentadas: suscribirse de nuevo tras cada
 * reconexión, mandar a la DLQ lo ilegible sin reintentarlo, y contar los
 * reintentos a mano porque RabbitMQ no los cuenta en un `nack(requeue)`.
 *
 * El envío real del correo le corresponde al Proveedor de Notificaciones
 * (sistema externo del SAD). Igual que el consumidor de la reventa, aquí queda
 * el registro de lo que se enviaría.
 */
@Injectable()
export class NotificacionesVenta implements OnApplicationBootstrap {
  private readonly log = new Logger(NotificacionesVenta.name);
  private readonly procesados = new Set<string>();
  private readonly intentos = new Map<string, number>();

  constructor(private readonly conexion: ConexionRabbitMq) {}

  async onApplicationBootstrap(): Promise<void> {
    this.conexion.registrarAlReconectar(() => this.preparar());
    await this.preparar();
  }

  /**
   * Publica un hecho. **Nunca lanza**: se llama con la compra ya escrita en la
   * base, y hacerla fallar porque un correo no salió sería mentirle al cliente
   * sobre algo que sí ocurrió. Si no se pudo publicar, queda en el registro.
   */
  async publicar(evento: EventoVenta): Promise<boolean> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) {
      this.log.error(`RabbitMQ no disponible: no se publicó ${evento.tipo} de ${evento.numeroCompra}`);
      return false;
    }
    try {
      const confirmado = await new Promise<boolean>((resolve) => {
        canal.publish(
          EXCHANGE_VENTAS,
          claveDe(evento.tipo),
          Buffer.from(JSON.stringify(evento)),
          { persistent: true, contentType: 'application/json', messageId: evento.id, type: evento.tipo },
          (error) => resolve(!error),
        );
      });
      if (!confirmado) this.log.error(`El broker no confirmó ${evento.tipo} de ${evento.numeroCompra}`);
      return confirmado;
    } catch (error) {
      this.log.error(`Fallo al publicar ${evento.tipo}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  /** Qué hace el consumidor con cada hecho. Lanzar significa "reintentar". */
  protected async notificar(evento: EventoVenta): Promise<void> {
    const cliente = evento.clienteId.slice(0, 8);
    if (evento.tipo === 'COMPRA_CONFIRMADA') {
      const boletos = evento.entradas.map((e) => `${e.numeroTicket} (${e.localidadNombre}) QR ${e.codigoQr}`).join(', ');
      this.log.log(
        `[correo a ${cliente}] Compra ${evento.numeroCompra} confirmada: ${evento.eventoNombre}. ` +
          `Total ${evento.monto} COP. Tus boletos: ${boletos}`,
      );
    } else {
      const boletos = evento.entradas.map((e) => e.numeroTicket).join(', ');
      this.log.log(
        `[correo a ${cliente}] Cancelaste ${boletos} de la compra ${evento.numeroCompra} ` +
          `(${evento.eventoNombre}). Reembolso de ${evento.monto} COP a tu medio de pago.`,
      );
    }
    await Promise.resolve();
  }

  private async preparar(): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return; // la conexión se reintenta sola y nos avisará al volver
    try {
      await declararTopologia(canal);
      await canal.consume(COLA_NOTIFICACIONES_VENTA, (mensaje) => {
        if (mensaje) {
          this.recibir(mensaje).catch((error: unknown) =>
            this.log.error(`Fallo no controlado en ${COLA_NOTIFICACIONES_VENTA}: ${error instanceof Error ? error.message : error}`),
          );
        }
      });
      this.log.log(`Escuchando ${COLA_NOTIFICACIONES_VENTA}`);
    } catch (error) {
      this.log.error(`No se pudo preparar la cola de ventas: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async recibir(mensaje: ConsumeMessage): Promise<void> {
    let evento: EventoVenta;
    try {
      evento = JSON.parse(mensaje.content.toString()) as EventoVenta;
    } catch {
      this.log.error(`Mensaje ilegible en ${COLA_NOTIFICACIONES_VENTA}; va a la DLQ`);
      return this.cerrar(mensaje, 'dlq');
    }
    if (evento.version !== 1) {
      this.log.error(`Versión ${String(evento.version)} desconocida; va a la DLQ`);
      return this.cerrar(mensaje, 'dlq');
    }
    if (this.procesados.has(evento.id)) return this.cerrar(mensaje, 'ack');

    try {
      await this.notificar(evento);
      this.procesados.add(evento.id);
      this.intentos.delete(evento.id);
      this.cerrar(mensaje, 'ack');
    } catch (error) {
      const fallos = (this.intentos.get(evento.id) ?? 0) + 1;
      this.intentos.set(evento.id, fallos);
      const causa = error instanceof Error ? error.message : String(error);
      if (fallos >= MAXIMO_INTENTOS) {
        this.log.error(`${evento.tipo} ${evento.numeroCompra} falló ${fallos} veces (${causa}); va a la DLQ`);
        this.intentos.delete(evento.id);
        return this.cerrar(mensaje, 'dlq');
      }
      this.log.warn(`${evento.tipo} ${evento.numeroCompra} falló (${causa}); intento ${fallos} de ${MAXIMO_INTENTOS}`);
      this.cerrar(mensaje, 'reintentar');
    }
  }

  private cerrar(mensaje: ConsumeMessage, accion: 'ack' | 'dlq' | 'reintentar'): void {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return; // se reentregará al reconectar
    try {
      if (accion === 'ack') canal.ack(mensaje);
      else canal.nack(mensaje, false, accion === 'reintentar');
    } catch {
      // Canal cerrado entretanto: el mensaje se reentregará.
    }
  }
}

function claveDe(tipo: TipoEventoVenta): string {
  return tipo === 'COMPRA_CONFIRMADA' ? 'compra.confirmada' : 'compra.cancelada';
}

async function declararTopologia(canal: ConfirmChannel): Promise<void> {
  await canal.assertExchange(EXCHANGE_VENTAS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_VENTAS_MUERTOS, 'topic', { durable: true });
  const muertos = `${COLA_NOTIFICACIONES_VENTA}.dlq`;
  await canal.assertQueue(muertos, { durable: true });
  await canal.bindQueue(muertos, EXCHANGE_VENTAS_MUERTOS, COLA_NOTIFICACIONES_VENTA);
  await canal.assertQueue(COLA_NOTIFICACIONES_VENTA, {
    durable: true,
    deadLetterExchange: EXCHANGE_VENTAS_MUERTOS,
    deadLetterRoutingKey: COLA_NOTIFICACIONES_VENTA,
  });
  // `compra.*`: confirmadas y canceladas llegan a la misma cola, porque las
  // dos son un correo al cliente.
  await canal.bindQueue(COLA_NOTIFICACIONES_VENTA, EXCHANGE_VENTAS, 'compra.*');
}
