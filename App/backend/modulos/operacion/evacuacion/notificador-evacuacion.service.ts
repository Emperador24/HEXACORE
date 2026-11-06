import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { CONEXION_OPERACION } from '../persistencia/conexion';
import { COLA_EVACUACION, MAXIMO_INTENTOS, declararTopologiaEvacuacion } from './topologia';

/** Cada cuánto se reintenta publicar lo que quedó pendiente. */
const REINTENTO_MS = 5000;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AvisoPendiente {
  id: string;
  evacuacion_id: string;
  canal: string;
  zona_id: string | null;
  mensaje: string;
  prioridad: number;
}

/**
 * CU-010, pasos 8-9: entrega de los avisos de evacuación.
 *
 * Los avisos se escriben en `notificaciones_evacuacion` en la misma
 * transacción que el cambio del protocolo (bandeja de salida) y este servicio
 * los publica después en la cola de prioridad. Si RabbitMQ no responde, el
 * protocolo sigue adelante igual y el aviso queda pendiente hasta el próximo
 * intento: una emergencia no puede esperar a que vuelva el broker.
 *
 * El consumidor hace de pasarela multicanal: marca cada aviso como entregado,
 * lo que deja medida la latencia publicación→entrega (RNF: "en segundos").
 */
@Injectable()
export class NotificadorEvacuacion implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificadorEvacuacion.name);
  private temporizador: NodeJS.Timeout | null = null;
  private despachando: Promise<number> | null = null;
  private cerrando = false;
  private readonly intentos = new Map<string, number>();

  constructor(
    private readonly conexion: ConexionRabbitMq,
    @InjectDataSource(CONEXION_OPERACION) private readonly datos: DataSource,
  ) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaEvacuacion);
    this.conexion.registrarAlReconectar(async () => {
      await this.conexion.consumir(COLA_EVACUACION, (m) => this.entregar(m));
      this.log.log(`Evacuación suscrita a "${COLA_EVACUACION}".`);
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

  /**
   * Publica los avisos pendientes, los más prioritarios primero. Un solo
   * despacho a la vez en este proceso; `SKIP LOCKED` evita que dos réplicas
   * publiquen el mismo aviso.
   */
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
        const pendientes: AvisoPendiente[] = await m.query(
          `SELECT id, evacuacion_id, canal, zona_id, mensaje, prioridad FROM notificaciones_evacuacion
            WHERE publicada_en IS NULL ORDER BY prioridad DESC, creada_en LIMIT 200 FOR UPDATE SKIP LOCKED`,
        );
        for (const aviso of pendientes) {
          const cuerpo = Buffer.from(JSON.stringify({
            id: aviso.id, evacuacionId: aviso.evacuacion_id, canal: aviso.canal, zonaId: aviso.zona_id,
            mensaje: aviso.mensaje, publicadoEn: new Date().toISOString(),
          }));
          try {
            await new Promise<void>((ok, falla) =>
              canal.sendToQueue(COLA_EVACUACION, cuerpo, { persistent: true, priority: aviso.prioridad, messageId: aviso.id },
                (error) => (error ? falla(error) : ok())));
            await m.query(`UPDATE notificaciones_evacuacion SET publicada_en = now(), intentos = intentos + 1 WHERE id = $1`, [aviso.id]);
            publicados++;
          } catch (error) {
            await m.query(`UPDATE notificaciones_evacuacion SET intentos = intentos + 1 WHERE id = $1`, [aviso.id]);
            this.log.warn(`Aviso ${aviso.id} sin publicar; se reintenta: ${(error as Error).message}`);
            break;
          }
        }
      });
    } catch (error) {
      this.log.warn(`Despacho de avisos de evacuación aplazado: ${(error as Error).message}`);
    }
    return publicados;
  }

  /** Pasarela multicanal: el aviso llegó a su canal. Idempotente por id. */
  private async entregar(mensaje: ConsumeMessage | null): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!mensaje || !canal) return;
    let id: string;
    try {
      id = (JSON.parse(mensaje.content.toString()) as { id: string }).id;
      if (!ES_UUID.test(id)) throw new Error('id inválido');
    } catch (error) {
      this.log.warn(`Aviso de evacuación descartado a la DLQ: ${(error as Error).message}`);
      canal.nack(mensaje, false, false);
      return;
    }
    try {
      await this.datos.query(`UPDATE notificaciones_evacuacion SET entregada_en = coalesce(entregada_en, now()) WHERE id = $1`, [id]);
      this.intentos.delete(id);
      canal.ack(mensaje);
    } catch (error) {
      const n = (this.intentos.get(id) ?? 0) + 1;
      this.intentos.set(id, n);
      if (n >= MAXIMO_INTENTOS) this.intentos.delete(id);
      this.log.warn(`Aviso ${id} sin marcar como entregado (intento ${n}/${MAXIMO_INTENTOS}): ${(error as Error).message}`);
      canal.nack(mensaje, false, n < MAXIMO_INTENTOS);
    }
  }
}
