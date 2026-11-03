import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { CONEXION_EVENTOS } from '../persistencia/conexion';
import { EventoSaliente } from '../persistencia/entidades/evento-saliente.entity';
import { CLAVES, EXCHANGE_EVENTOS, MensajeEvento } from './contrato';

const INTERVALO_MS = 500;
const LOTE = 50;

/**
 * Bandeja de salida de la gestión de eventos (ADR-15), mismo patrón que la de
 * Ventas: el mensaje se escribe en la transacción del cambio y este servicio
 * lo publica después, con confirmación del broker y en orden de secuencia.
 * Si RabbitMQ no está, los mensajes esperan en la tabla; nada se pierde.
 */
@Injectable()
export class BandejaEventos implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(BandejaEventos.name);
  private temporizador: NodeJS.Timeout | null = null;
  private trabajando = false;
  private ejecucion: Promise<number> = Promise.resolve(0);

  constructor(
    @InjectDataSource(CONEXION_EVENTOS) private readonly fuenteDatos: DataSource,
    private readonly conexion: ConexionRabbitMq,
  ) {}

  /** **Dentro de la transacción del cambio.** */
  async encolar(tx: EntityManager, mensaje: MensajeEvento): Promise<void> {
    await tx
      .createQueryBuilder()
      .insert()
      .into(EventoSaliente)
      .values({ exchange: EXCHANGE_EVENTOS, clave: CLAVES[mensaje.tipo], cuerpo: () => ':cuerpo' })
      .setParameter('cuerpo', JSON.stringify(mensaje))
      .execute();
  }

  onApplicationBootstrap(): void {
    this.temporizador = setInterval(() => {
      if (!this.trabajando) this.ejecucion = this.publicarPendientes();
    }, INTERVALO_MS);
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    await this.ejecucion;
    this.log.log('Outbox Eventos detenido');
  }

  async publicarPendientes(): Promise<number> {
    if (this.trabajando) return 0;
    const canal = this.conexion.obtenerCanal();
    if (!canal) return 0;
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
        await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });

        const publicados: string[] = [];
        for (const pendiente of pendientes) {
          const cuerpo: Record<string, unknown> = { ...pendiente.cuerpo, secuencia: Number(pendiente.secuencia) };
          const confirmado = await new Promise<boolean>((resolve) => {
            canal.publish(pendiente.exchange, pendiente.clave, Buffer.from(JSON.stringify(cuerpo)), {
              persistent: true,
              contentType: 'application/json',
              messageId: String(cuerpo.id ?? pendiente.secuencia),
              type: String(cuerpo.tipo ?? pendiente.clave),
            }, (error) => resolve(!error));
          });
          if (!confirmado) break; // el orden de la secuencia no se rompe
          publicados.push(pendiente.secuencia);
        }
        if (publicados.length > 0) {
          await tx.update(EventoSaliente, { secuencia: In(publicados) }, { publicadoEn: new Date() });
        }
        return publicados.length;
      });
    } catch (error) {
      this.log.warn(`Bandeja de eventos sin vaciar: ${error instanceof Error ? error.message : error}`);
      return 0;
    } finally {
      this.trabajando = false;
    }
  }
}
