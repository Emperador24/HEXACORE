import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';
import { COLA_RESERVAS, MAXIMO_INTENTOS, declararTopologiaReservas } from './topologia';

/** Cada cuánto se reintenta publicar lo que quedó pendiente. */
const REINTENTO_MS = 5000;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CU-021, paso 9: envío de la confirmación y el QR al cliente.
 *
 * El aviso se escribe en `notificaciones_reserva` en la misma transacción que
 * confirma la reserva (bandeja de salida) y este servicio lo publica después.
 * El consumidor hace de Proveedor de Notificaciones —sistema externo del
 * SAD—, igual que el de la venta de entradas: deja en el registro el correo
 * que se enviaría y marca el aviso como entregado.
 */
@Injectable()
export class NotificadorReservas implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificadorReservas.name);
  private temporizador: NodeJS.Timeout | null = null;
  private despachando: Promise<number> | null = null;
  private cerrando = false;
  private readonly intentos = new Map<string, number>();

  constructor(
    private readonly conexion: ConexionRabbitMq,
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
  ) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaReservas);
    this.conexion.registrarAlReconectar(async () => {
      await this.conexion.consumir(COLA_RESERVAS, (m) => this.entregar(m));
      this.log.log(`Reservas de parqueadero suscritas a "${COLA_RESERVAS}".`);
      void this.despachar();
    });
    this.temporizador = setInterval(() => void this.despachar(), REINTENTO_MS);
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.cerrando = true;
    if (this.temporizador) clearInterval(this.temporizador);
    await this.despachando?.catch(() => undefined);
  }

  /** Publica los avisos pendientes; `SKIP LOCKED` evita que dos réplicas publiquen el mismo. */
  despachar(): Promise<number> {
    if (this.cerrando) return Promise.resolve(0);
    if (this.despachando) return this.despachando;
    this.despachando = this.publicarPendientes().finally(() => { this.despachando = null; });
    return this.despachando;
  }

  private async publicarPendientes(): Promise<number> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return 0;
    let publicados = 0;
    try {
      await this.datos.transaction(async (m) => {
        const pendientes: { id: string; reserva_id: string; cliente_id: string; mensaje: string }[] = await m.query(
          `SELECT id, reserva_id, cliente_id, mensaje FROM notificaciones_reserva WHERE publicada_en IS NULL ORDER BY creada_en LIMIT 200 FOR UPDATE SKIP LOCKED`);
        for (const aviso of pendientes) {
          const cuerpo = Buffer.from(JSON.stringify({
            id: aviso.id, reservaId: aviso.reserva_id, clienteId: aviso.cliente_id, mensaje: aviso.mensaje, publicadoEn: new Date().toISOString(),
          }));
          try {
            await new Promise<void>((ok, falla) =>
              canal.sendToQueue(COLA_RESERVAS, cuerpo, { persistent: true, messageId: aviso.id, contentType: 'application/json' },
                (error) => (error ? falla(error) : ok())));
            await m.query(`UPDATE notificaciones_reserva SET publicada_en = now(), intentos = intentos + 1 WHERE id = $1`, [aviso.id]);
            publicados++;
          } catch (error) {
            await m.query(`UPDATE notificaciones_reserva SET intentos = intentos + 1 WHERE id = $1`, [aviso.id]);
            this.log.warn(`Confirmación ${aviso.id} sin publicar; se reintenta: ${(error as Error).message}`);
            break;
          }
        }
      });
    } catch (error) {
      this.log.warn(`Despacho de confirmaciones de reserva aplazado: ${(error as Error).message}`);
    }
    return publicados;
  }

  /** Proveedor de Notificaciones: el correo con el QR sale; idempotente por id. */
  private async entregar(mensaje: ConsumeMessage | null): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!mensaje || !canal) return;
    let aviso: { id: string; clienteId: string; mensaje: string };
    try {
      aviso = JSON.parse(mensaje.content.toString());
      if (!ES_UUID.test(aviso.id)) throw new Error('id inválido');
    } catch (error) {
      this.log.warn(`Confirmación de reserva descartada a la DLQ: ${(error as Error).message}`);
      canal.nack(mensaje, false, false);
      return;
    }
    try {
      const [, marcadas] = await this.datos.query(
        `UPDATE notificaciones_reserva SET entregada_en = now() WHERE id = $1 AND entregada_en IS NULL`, [aviso.id]);
      if (marcadas) this.log.log(`[correo a ${aviso.clienteId.slice(0, 8)}] ${aviso.mensaje}`);
      this.intentos.delete(aviso.id);
      canal.ack(mensaje);
    } catch (error) {
      const n = (this.intentos.get(aviso.id) ?? 0) + 1;
      this.intentos.set(aviso.id, n);
      if (n >= MAXIMO_INTENTOS) this.intentos.delete(aviso.id);
      this.log.warn(`Confirmación ${aviso.id} sin entregar (intento ${n}/${MAXIMO_INTENTOS}): ${(error as Error).message}`);
      canal.nack(mensaje, false, n < MAXIMO_INTENTOS);
    }
  }
}
