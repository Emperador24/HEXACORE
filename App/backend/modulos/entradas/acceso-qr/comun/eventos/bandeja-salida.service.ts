import { CONEXION } from '../../persistencia/conexion';
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { EventoSaliente } from '../../persistencia/entidades/evento-saliente.entity';
import { ConexionRabbitMq } from '../rabbitmq/conexion-rabbitmq.service';

/** Cada cuánto se mira la bandeja. Es la latencia máxima entre el commit y el broker. */
const INTERVALO_MS = 300;
/**
 * Hasta cuántos avisos salen por vuelta. Con las confirmaciones en paralelo una
 * vuelta tarda lo que una ida y vuelta al broker, así que el techo es de unos
 * LOTE / INTERVALO_MS avisos por segundo (≈ 1 600). Esperando cada confirmación
 * por separado se quedaba en unos 50/s, y en un pico de ingresos el panel de
 * Monitoreo (RNF-09, ≤ 2 s) se atrasaba minutos.
 */
const LOTE = 500;

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
export class BandejaSalida implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(BandejaSalida.name);
  private temporizador: NodeJS.Timeout | null = null;
  private trabajando = false;
  private ejecucion: Promise<number> = Promise.resolve(0);

  constructor(
    @InjectDataSource(CONEXION) private readonly fuenteDatos: DataSource,
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
    this.temporizador = setInterval(() => {
      if (!this.trabajando) this.ejecucion = this.publicarPendientes();
    }, INTERVALO_MS);
    // Sin `unref` el proceso no terminaría al recibir SIGTERM (RNF-15).
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    await this.ejecucion;
    this.log.log('Outbox Acceso QR detenido');
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

        // Todo el lote sale en orden por el mismo canal y después se esperan las
        // confirmaciones juntas, no una por una.
        const confirmaciones = pendientes.map((pendiente) => {
          const cuerpo: Record<string, unknown> = { ...pendiente.cuerpo, secuencia: Number(pendiente.secuencia) };
          return new Promise<boolean>((resolve) => {
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
        });
        const confirmados = await Promise.all(confirmaciones);
        // Solo se marcan los anteriores al primero que falle: ese y los que le
        // siguen vuelven a salir en la próxima vuelta, en orden. Los que ya
        // llegaron llegarán dos veces, y quien consume los descarta por `id`.
        const primerFallo = confirmados.indexOf(false);
        const publicados = pendientes.slice(0, primerFallo === -1 ? pendientes.length : primerFallo).map((p) => p.secuencia);

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
