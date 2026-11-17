import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { ConciliacionService } from './conciliacion.service';
import { CONEXION_CONCILIACION } from './persistencia/conexion';
import { COLA_CONCILIACION, MAXIMO_INTENTOS, declararTopologiaConciliacion } from './topologia';

/** Cada cuánto se reintenta publicar lo que quedó pendiente de despachar. */
const REINTENTO_MS = 5000;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CU-031, infraestructura no trivial: "integración asíncrona con la pasarela
 * de pagos externa vía cola de mensajes".
 *
 * Mismo patrón de bandeja de salida que CU-010/CU-020: `solicitar` solo deja
 * la fila en `conciliaciones` (`despachada_en IS NULL`); este servicio la
 * publica en la cola y, del otro lado, consume el mensaje y dispara la
 * comparación real (`ConciliacionService.procesar`). Si la pasarela está
 * lenta o caída, lo que se bloquea es el consumidor, nunca la petición HTTP
 * que hizo el administrador financiero.
 */
@Injectable()
export class ConciliadorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ConciliadorService.name);
  private temporizador: NodeJS.Timeout | null = null;
  private despachando: Promise<number> | null = null;
  private cerrando = false;

  constructor(
    private readonly conexion: ConexionRabbitMq,
    private readonly conciliacion: ConciliacionService,
    @InjectDataSource(CONEXION_CONCILIACION) private readonly datos: DataSource,
  ) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaConciliacion);
    this.conexion.registrarAlReconectar(async () => {
      await this.conexion.consumir(COLA_CONCILIACION, (m) => this.procesarMensaje(m));
      this.log.log(`Conciliación suscrita a "${COLA_CONCILIACION}".`);
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

  despachar(): Promise<number> {
    if (this.cerrando) return Promise.resolve(0);
    if (this.despachando) return this.despachando;
    this.despachando = this.despacharPendientes().finally(() => { this.despachando = null; });
    return this.despachando;
  }

  private async despacharPendientes(): Promise<number> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return 0;
    let publicadas = 0;
    try {
      await this.datos.transaction(async (m) => {
        const pendientes: { id: string }[] = await m.query(
          `SELECT id FROM conciliaciones WHERE despachada_en IS NULL ORDER BY solicitada_en LIMIT 50 FOR UPDATE SKIP LOCKED`,
        );
        for (const { id } of pendientes) {
          try {
            await new Promise<void>((ok, falla) =>
              canal.sendToQueue(COLA_CONCILIACION, Buffer.from(JSON.stringify({ conciliacionId: id })), { persistent: true, messageId: id },
                (error) => (error ? falla(error) : ok())));
            await m.query(`UPDATE conciliaciones SET despachada_en = now() WHERE id = $1`, [id]);
            publicadas++;
          } catch (error) {
            this.log.warn(`Conciliación ${id} sin despachar; se reintenta: ${(error as Error).message}`);
            break;
          }
        }
      });
    } catch (error) {
      this.log.warn(`Despacho de conciliaciones aplazado: ${(error as Error).message}`);
    }
    return publicadas;
  }

  private async procesarMensaje(mensaje: ConsumeMessage | null): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!mensaje || !canal) return;
    let conciliacionId: string;
    try {
      conciliacionId = (JSON.parse(mensaje.content.toString()) as { conciliacionId: string }).conciliacionId;
      if (!ES_UUID.test(conciliacionId)) throw new Error('conciliacionId inválido');
    } catch (error) {
      this.log.warn(`Mensaje de conciliación descartado a la DLQ: ${(error as Error).message}`);
      canal.nack(mensaje, false, false);
      return;
    }
    try {
      await this.conciliacion.procesar(conciliacionId);
      canal.ack(mensaje);
    } catch (error) {
      const intentos = (mensaje.properties.headers?.['x-death'] as unknown[] | undefined)?.length ?? 0;
      this.log.error(`Conciliación ${conciliacionId} sin procesar (intento ${intentos + 1}/${MAXIMO_INTENTOS}): ${(error as Error).message}`);
      canal.nack(mensaje, false, intentos + 1 < MAXIMO_INTENTOS);
    }
  }
}
