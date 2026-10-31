import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { DataSource, In } from 'typeorm';
import { ConexionRabbitMq } from '../comun/eventos/conexion-rabbitmq.service';
import { MAXIMO_INTENTOS } from '../comun/eventos/topologia';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';

/** Exchange donde publica Acceso QR, desde su bandeja de salida. */
export const EXCHANGE_ACCESO = 'acceso.eventos';
export const COLA_INGRESOS = 'ventas.ingresos';
const EXCHANGE_MUERTOS = 'ventas.muertos';

/**
 * Marca como usadas las entradas que pasaron por la puerta (ADR-15).
 *
 * Desde ADR-15 Acceso QR valida contra su propia copia de los QR y no le pide
 * nada a Ventas, así que Ventas tiene que enterarse por el broker. Lo necesita
 * para dos reglas suyas: no reembolsar una entrada usada (CU-003D) y no dejar
 * revenderla (CU-006).
 *
 * Es consistencia eventual: entre que alguien entra y llega el evento pasa
 * medio segundo, en el que una cancelación todavía vería la entrada válida. Los
 * plazos de cancelación cierran antes del evento, así que en la práctica la
 * ventana no se alcanza.
 *
 * Idempotente por construcción: el `UPDATE` solo cambia una entrada que no
 * esté ya `USADA` o `ANULADA`, así que un evento repetido no hace nada.
 */
@Injectable()
export class ConsumidorIngresos implements OnApplicationBootstrap {
  private readonly log = new Logger(ConsumidorIngresos.name);
  private readonly intentos = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly conexion: ConexionRabbitMq,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.conexion.registrarAlReconectar(() => this.preparar());
    await this.preparar();
  }

  /** Marca la entrada como usada. Devuelve `false` si ya lo estaba o no existe. */
  async registrarUso(entradaId: string): Promise<boolean> {
    const marcada = await this.fuenteDatos
      .getRepository(Entrada)
      .update({ id: entradaId, estado: In([EstadoEntrada.VALIDA, EstadoEntrada.EN_REVENTA]) }, { estado: EstadoEntrada.USADA });
    return (marcada.affected ?? 0) > 0;
  }

  private async preparar(): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return; // la conexión se reintenta sola y avisa al volver
    try {
      await declararTopologia(canal);
      await canal.consume(COLA_INGRESOS, (mensaje) => {
        if (mensaje) {
          this.recibir(canal, mensaje).catch((error: unknown) =>
            this.log.error(`Fallo no controlado en ${COLA_INGRESOS}: ${error instanceof Error ? error.message : error}`),
          );
        }
      });
      this.log.log(`Escuchando ${COLA_INGRESOS}`);
    } catch (error) {
      this.log.error(`No se pudo preparar ${COLA_INGRESOS}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async recibir(canal: ConfirmChannel, mensaje: ConsumeMessage): Promise<void> {
    let evento: { id?: unknown; version?: unknown; entradaId?: unknown };
    try {
      evento = JSON.parse(mensaje.content.toString()) as typeof evento;
    } catch {
      evento = {};
    }
    if (evento.version !== 1 || typeof evento.id !== 'string' || typeof evento.entradaId !== 'string') {
      this.log.error(`Mensaje ilegible en ${COLA_INGRESOS}; va a la DLQ`);
      return cerrar(canal, mensaje, 'dlq');
    }

    try {
      const antes = await this.fuenteDatos.getRepository(Entrada).findOneBy({ id: evento.entradaId });
      if (antes?.estado === EstadoEntrada.EN_REVENTA) {
        // La puerta la dejó pasar antes de enterarse de que salió a reventa:
        // es la ventana de la consistencia eventual. Queda USADA, así la
        // transferencia de Postventa falla y se compensa sola.
        this.log.error(`ALERTA: la entrada ${antes.numeroTicket} ingresó mientras estaba publicada en reventa`);
      }
      await this.registrarUso(evento.entradaId);
      this.intentos.delete(evento.id);
      cerrar(canal, mensaje, 'ack');
    } catch (error) {
      const fallos = (this.intentos.get(evento.id) ?? 0) + 1;
      const causa = error instanceof Error ? error.message : String(error);
      if (fallos >= MAXIMO_INTENTOS) {
        this.intentos.delete(evento.id);
        this.log.error(`IngresoRegistrado ${evento.id} falló ${fallos} veces (${causa}); va a la DLQ`);
        return cerrar(canal, mensaje, 'dlq');
      }
      this.intentos.set(evento.id, fallos);
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
  await canal.assertExchange(EXCHANGE_ACCESO, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });
  const muertos = `${COLA_INGRESOS}.dlq`;
  await canal.assertQueue(muertos, { durable: true });
  await canal.bindQueue(muertos, EXCHANGE_MUERTOS, COLA_INGRESOS);
  await canal.assertQueue(COLA_INGRESOS, {
    durable: true,
    deadLetterExchange: EXCHANGE_MUERTOS,
    deadLetterRoutingKey: COLA_INGRESOS,
  });
  await canal.bindQueue(COLA_INGRESOS, EXCHANGE_ACCESO, 'ingreso.registrado');
}
