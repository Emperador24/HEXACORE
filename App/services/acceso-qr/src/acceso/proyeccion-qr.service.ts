import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../comun/rabbitmq/conexion-rabbitmq.service';
import { EstadoQr } from '../persistencia/entidades/qr-entrada.entity';

/** Exchange donde publica Ventas, desde su bandeja de salida. */
export const EXCHANGE_VENTAS = 'ventas.eventos';
export const COLA_QR = 'acceso-qr.entradas';
const EXCHANGE_MUERTOS = 'acceso-qr.muertos';
const MAXIMO_INTENTOS = 3;

const ESTADOS = new Set<string>(Object.values(EstadoQr));
const ES_HASH = /^[0-9a-f]{64}$/;

/** Lo que la puerta necesita saber de una entrada. */
export interface CambioQr {
  entradaId: string;
  eventoId: string;
  hashQr: string;
  numeroTicket: string;
  localidadNombre: string;
  estado: EstadoQr;
  secuencia: number;
}

/**
 * Traduce un mensaje del broker a los cambios de QR que trae.
 *
 * - `COMPRA_CONFIRMADA`: activa los QR de las entradas emitidas.
 * - `ENTRADA_ACTUALIZADA`: la entrada salió a reventa o volvió, cambió de dueño
 *   (QR nuevo: el anterior deja de valer) o se anuló.
 *
 * Devuelve `null` si el mensaje no se entiende: va a la DLQ, no se reintenta,
 * porque un mensaje mal formado fallará igual las mil veces.
 */
export function cambiosDe(mensaje: Record<string, unknown>): CambioQr[] | null {
  const secuencia = Number(mensaje.secuencia);
  if (mensaje.version !== 1 || !Number.isSafeInteger(secuencia)) return null;

  if (mensaje.tipo === 'COMPRA_CONFIRMADA') {
    if (typeof mensaje.eventoId !== 'string' || !Array.isArray(mensaje.entradas)) return null;
    const cambios: CambioQr[] = [];
    for (const e of mensaje.entradas as Record<string, unknown>[]) {
      const cambio = cambioDe({ ...e, eventoId: mensaje.eventoId, estado: e.estado ?? EstadoQr.VALIDA }, secuencia);
      if (!cambio) return null;
      cambios.push(cambio);
    }
    return cambios;
  }

  if (mensaje.tipo === 'ENTRADA_ACTUALIZADA') {
    const cambio = cambioDe(mensaje, secuencia);
    return cambio ? [cambio] : null;
  }

  // Otro hecho de Ventas que no le importa a la puerta (p. ej. COMPRA_CANCELADA,
  // cuyas entradas ya llegaron anuladas por ENTRADA_ACTUALIZADA).
  return [];
}

function cambioDe(datos: Record<string, unknown>, secuencia: number): CambioQr | null {
  const { entradaId, eventoId, hashQr, numeroTicket, localidadNombre, estado } = datos;
  if (
    typeof entradaId !== 'string' ||
    typeof eventoId !== 'string' ||
    typeof hashQr !== 'string' || !ES_HASH.test(hashQr) ||
    typeof numeroTicket !== 'string' ||
    typeof localidadNombre !== 'string' ||
    typeof estado !== 'string' || !ESTADOS.has(estado)
  ) {
    return null;
  }
  return { entradaId, eventoId, hashQr, numeroTicket, localidadNombre, estado: estado as EstadoQr, secuencia };
}

/**
 * Mantiene la copia de los QR que usa la puerta (ADR-15).
 *
 * Es lo que permite que Acceso QR valide **sin llamar a Ventas**: antes cada
 * escaneo era una llamada síncrona, y si Ventas iba lento en plena apertura de
 * venta, la puerta del evento de esa noche se atascaba con él. Ahora la puerta
 * depende de su propia base, y Ventas solo tiene que publicar.
 *
 * ## Lo que se gana y lo que se paga
 *
 * Se gana aislamiento: el pico de la puerta y el de la venta ya no se tocan.
 * Se paga con **consistencia eventual**: una entrada recién comprada tarda lo
 * que tarde el evento en llegar —medio segundo en condiciones normales— en
 * poder entrar. Para una puerta que abre horas después de la compra es
 * irrelevante.
 *
 * ## USADA no se pisa
 *
 * `USADA` lo pone la puerta, no Ventas: Ventas ni se entera de que alguien
 * entró. Un evento que llega después no puede devolver a `VALIDA` una entrada
 * que ya pasó por la puerta, o serviría dos veces. Si lo que llega es una
 * transferencia de una entrada ya usada, se registra como alerta: es la
 * ventana que la consistencia eventual deja abierta, y hay que verla.
 */
@Injectable()
export class ProyeccionQr implements OnModuleInit {
  private readonly log = new Logger(ProyeccionQr.name);
  private readonly intentos = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly conexion: ConexionRabbitMq,
  ) {}

  /**
   * Se registra antes de que la conexión se abra: así la suscripción se hace
   * en el primer canal y se rehace en cada reconexión, por el mismo camino.
   */
  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologia);
    this.conexion.registrarAlReconectar(() => this.suscribir());
  }

  /** Aplica los cambios de un mensaje. Idempotente: aplicar dos veces lo mismo no cambia nada. */
  async aplicar(cambios: CambioQr[]): Promise<void> {
    await this.fuenteDatos.transaction(async (tx) => {
      for (const cambio of cambios) {
        const previa = await tx.query(
          `SELECT estado, hash_qr FROM qr_entradas WHERE entrada_id = $1 FOR UPDATE`,
          [cambio.entradaId],
        );
        if (previa[0]?.estado === EstadoQr.USADA && previa[0].hash_qr !== cambio.hashQr) {
          this.log.error(
            `ALERTA: la entrada ${cambio.numeroTicket} ya ingresó y ahora llega un QR nuevo ` +
              `(${cambio.estado}). No se acepta: hay que revisarlo con el comprador.`,
          );
        }

        // Solo gana un cambio más nuevo que el guardado, y USADA se conserva.
        await tx.query(
          `INSERT INTO qr_entradas
             (entrada_id, evento_id, hash_qr, numero_ticket, localidad_nombre, estado, secuencia)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (entrada_id) DO UPDATE SET
             evento_id = EXCLUDED.evento_id,
             hash_qr = CASE WHEN qr_entradas.estado = 'USADA' THEN qr_entradas.hash_qr ELSE EXCLUDED.hash_qr END,
             numero_ticket = EXCLUDED.numero_ticket,
             localidad_nombre = EXCLUDED.localidad_nombre,
             estado = CASE WHEN qr_entradas.estado = 'USADA' THEN 'USADA' ELSE EXCLUDED.estado END,
             secuencia = EXCLUDED.secuencia,
             actualizado_en = now()
           WHERE qr_entradas.secuencia < EXCLUDED.secuencia`,
          [
            cambio.entradaId,
            cambio.eventoId,
            cambio.hashQr,
            cambio.numeroTicket,
            cambio.localidadNombre,
            cambio.estado,
            cambio.secuencia,
          ],
        );
      }
    });
  }

  private async suscribir(): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return; // la conexión se reintenta sola y avisa al volver
    try {
      await canal.prefetch(20);
      await canal.consume(COLA_QR, (mensaje) => {
        if (mensaje) {
          this.recibir(canal, mensaje).catch((error: unknown) =>
            this.log.error(`Fallo no controlado en ${COLA_QR}: ${error instanceof Error ? error.message : error}`),
          );
        }
      });
      this.log.log(`Escuchando ${COLA_QR}`);
    } catch (error) {
      this.log.error(`No se pudo suscribir a ${COLA_QR}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async recibir(canal: ConfirmChannel, mensaje: ConsumeMessage): Promise<void> {
    let cambios: CambioQr[] | null;
    try {
      cambios = cambiosDe(JSON.parse(mensaje.content.toString()) as Record<string, unknown>);
    } catch {
      cambios = null;
    }
    if (!cambios) {
      this.log.error(`Mensaje ilegible en ${COLA_QR}; va a la DLQ`);
      return cerrar(canal, mensaje, 'dlq');
    }

    const id = mensaje.properties.messageId ?? mensaje.content.toString().slice(0, 80);
    try {
      await this.aplicar(cambios);
      this.intentos.delete(id);
      cerrar(canal, mensaje, 'ack');
    } catch (error) {
      // RabbitMQ no cuenta los reintentos de un `nack(requeue)`: se cuentan a
      // mano, o un fallo permanente rebotaría para siempre.
      const fallos = (this.intentos.get(id) ?? 0) + 1;
      const causa = error instanceof Error ? error.message : String(error);
      if (fallos >= MAXIMO_INTENTOS) {
        this.intentos.delete(id);
        this.log.error(`No se pudo aplicar ${id} tras ${fallos} intentos (${causa}); va a la DLQ`);
        return cerrar(canal, mensaje, 'dlq');
      }
      this.intentos.set(id, fallos);
      this.log.warn(`No se pudo aplicar ${id} (${causa}); intento ${fallos} de ${MAXIMO_INTENTOS}`);
      cerrar(canal, mensaje, 'reintentar');
    }
  }
}

function cerrar(canal: ConfirmChannel, mensaje: ConsumeMessage, accion: 'ack' | 'dlq' | 'reintentar'): void {
  try {
    if (accion === 'ack') canal.ack(mensaje);
    else canal.nack(mensaje, false, accion === 'reintentar');
  } catch {
    // Canal cerrado entretanto: el mensaje se reentregará al reconectar.
  }
}

async function declararTopologia(canal: ConfirmChannel): Promise<void> {
  await canal.assertExchange(EXCHANGE_VENTAS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });
  const muertos = `${COLA_QR}.dlq`;
  await canal.assertQueue(muertos, { durable: true });
  await canal.bindQueue(muertos, EXCHANGE_MUERTOS, COLA_QR);
  await canal.assertQueue(COLA_QR, {
    durable: true,
    deadLetterExchange: EXCHANGE_MUERTOS,
    deadLetterRoutingKey: COLA_QR,
  });
  await canal.bindQueue(COLA_QR, EXCHANGE_VENTAS, 'compra.confirmada');
  await canal.bindQueue(COLA_QR, EXCHANGE_VENTAS, 'entrada.actualizada');
}
