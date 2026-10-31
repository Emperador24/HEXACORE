import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { EventoSaliente } from '../../persistencia/entidades/evento-saliente.entity';
import { ConexionRabbitMq } from '../rabbitmq/conexion-rabbitmq.service';

/** Cada cuánto se mira la bandeja. Es la latencia máxima entre el commit y el broker. */
const INTERVALO_MS = 300;
const LOTE = 100;

/**
 * Bandeja de salida: Transactional Outbox (ADR-15). Copia de la de Ventas.
 *
 * Acceso QR publica `IngresoRegistrado` en la misma transacción que deja
 * entrar a alguien. Si se perdiera, Ventas no sabría que la entrada se usó y
 * dejaría cancelarla con reembolso (CU-003D) o revenderla.
 *
 * El publicador toma su lote con `FOR UPDATE SKIP LOCKED`, así que varias
 * réplicas no publican dos veces lo mismo; si una cae entre publicar y marcar,
 * el lote vuelve a salir y quien consume lo descarta por `id`.
 */
@Injectable()
export class BandejaSalida implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(BandejaSalida.name);
  private temporizador: NodeJS.Timeout | null = null;
  private trabajando = false;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly conexion: ConexionRabbitMq,
  ) {}

  /** Deja un evento para publicar. **Llamarlo dentro de la transacción del cambio.** */
  async encolar(tx: EntityManager, exchange: string, clave: string, cuerpo: object): Promise<void> {
    await tx
      .createQueryBuilder()
      .insert()
      .into(EventoSaliente)
      .values({ exchange, clave, cuerpo: () => ':cuerpo' })
      .setParameter('cuerpo', JSON.stringify(cuerpo))
      .execute();
  }

  onApplicationBootstrap(): void {
    this.temporizador = setInterval(() => void this.publicarPendientes(), INTERVALO_MS);
    // Sin `unref` el proceso no terminaría al recibir SIGTERM (RNF-15).
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  /** Publica un lote. Devuelve cuántos salieron; lo usan las pruebas. */
  async publicarPendientes(): Promise<number> {
    if (this.trabajando) return 0;
    const canal = this.conexion.obtenerCanal();
    if (!canal) return 0; // se queda en la bandeja hasta que vuelva el broker
    this.trabajando = true;
    try {
      return await this.fuenteDatos.transaction(async (tx) => {
        const pendientes = await tx
          .createQueryBuilder(EventoSaliente, 'e')
          .where('e.publicado_en IS NULL')
          .orderBy('e.secuencia', 'ASC')
          .limit(LOTE)
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany();
        if (pendientes.length === 0) return 0;

        for (const exchange of new Set(pendientes.map((p) => p.exchange))) {
          await canal.assertExchange(exchange, 'topic', { durable: true });
        }

        const publicados: string[] = [];
        for (const pendiente of pendientes) {
          const cuerpo: Record<string, unknown> = { ...pendiente.cuerpo, secuencia: Number(pendiente.secuencia) };
          const confirmado = await new Promise<boolean>((resolve) => {
            canal.publish(
              pendiente.exchange,
              pendiente.clave,
              Buffer.from(JSON.stringify(cuerpo)),
              {
                persistent: true,
                contentType: 'application/json',
                messageId: String(cuerpo.id ?? pendiente.secuencia),
                type: String(cuerpo.tipo ?? pendiente.clave),
              },
              (error) => resolve(!error),
            );
          });
          // Se para en el primero que falle: publicar los siguientes rompería
          // el orden que la secuencia promete.
          if (!confirmado) break;
          publicados.push(pendiente.secuencia);
        }

        if (publicados.length > 0) {
          await tx.update(EventoSaliente, { secuencia: In(publicados) }, { publicadoEn: new Date() });
        }
        return publicados.length;
      });
    } catch (error) {
      this.log.error(`No se pudo vaciar la bandeja de salida: ${error instanceof Error ? error.message : error}`);
      return 0;
    } finally {
      this.trabajando = false;
    }
  }
}
