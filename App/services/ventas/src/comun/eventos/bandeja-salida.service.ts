import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { Entrada } from '../../persistencia/entidades/entrada.entity';
import { EventoSaliente } from '../../persistencia/entidades/evento-saliente.entity';
import { hashQr } from '../qr/hash-qr';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';

/** Exchange de los hechos de la venta primaria y del ciclo de vida de una entrada. */
export const EXCHANGE_VENTAS = 'ventas.eventos';

/**
 * Estado de una entrada tal como lo necesita la puerta (ADR-15).
 *
 * Acceso QR ya no le pregunta a Ventas: mantiene su propia copia de cada QR y
 * la actualiza con este evento. Lleva el **hash** del código, no el código: a
 * la puerta le basta con comparar, y así un volcado de su base no sirve para
 * fabricar entradas.
 *
 * Se publica cada vez que cambia algo que la puerta tiene que saber: la
 * entrada sale a reventa o vuelve, cambia de dueño (QR nuevo; el anterior deja
 * de valer) o se anula. La emisión va dentro de `COMPRA_CONFIRMADA`.
 */
export interface EventoEntradaActualizada {
  id: string;
  tipo: 'ENTRADA_ACTUALIZADA';
  version: 1;
  ocurridoEn: string;
  entradaId: string;
  eventoId: string;
  estado: string;
  hashQr: string;
  numeroTicket: string;
  localidadNombre: string;
}

export const CLAVE_ENTRADA_ACTUALIZADA = 'entrada.actualizada';

/** El evento que describe cómo quedó una entrada. También lo usa la semilla. */
export function entradaActualizada(entrada: Entrada): EventoEntradaActualizada {
  return {
    // Se guarda con el evento: si el publicador lo reenvía, llega con el
    // mismo id y quien consume lo reconoce como repetido.
    id: randomUUID(),
    tipo: 'ENTRADA_ACTUALIZADA',
    version: 1,
    ocurridoEn: new Date().toISOString(),
    entradaId: entrada.id,
    eventoId: entrada.eventoId,
    estado: entrada.estado,
    hashQr: hashQr(entrada.codigoQr),
    numeroTicket: entrada.numeroTicket,
    localidadNombre: entrada.localidadNombre,
  };
}

/** Cada cuánto se mira la bandeja. Es la latencia máxima entre el commit y el broker. */
const INTERVALO_MS = 300;
const LOTE = 100;

/**
 * Bandeja de salida: Transactional Outbox (ADR-15).
 *
 * ## El problema que resuelve
 *
 * Guardar en la base y publicar en el broker son dos sistemas: no hay
 * transacción que abarque los dos. Publicar después del commit —lo que se
 * hacía antes— pierde el evento si el broker está caído o el proceso muere en
 * medio. Para un correo era tolerable; para la puerta no: sin el evento, Acceso
 * QR no conoce la entrada y alguien que pagó se queda fuera.
 *
 * ## Cómo
 *
 * 1. `encolar` escribe el evento en `eventos_salientes` **dentro de la misma
 *    transacción** que el cambio. Se guardan los dos o ninguno.
 * 2. Este servicio lee lo pendiente cada `INTERVALO_MS`, lo publica con
 *    confirmación del broker y lo marca publicado.
 *
 * Con varias réplicas de Ventas, cada una toma su lote con
 * `FOR UPDATE SKIP LOCKED`: no se pisan ni publican dos veces lo mismo. Si una
 * cae entre publicar y marcar, el lote vuelve a salir: la entrega es "al menos
 * una vez", y por eso cada evento lleva un `id` con el que descartar el
 * repetido.
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

  /**
   * Encola el estado actual de unas entradas para la puerta.
   *
   * Lee las filas **dentro de la transacción y después de cambiarlas**, así que
   * lo que sale es lo que quedó escrito, y el orden de la secuencia sigue al
   * del bloqueo de fila.
   */
  async encolarEstadoDe(tx: EntityManager, entradaIds: string[]): Promise<void> {
    if (entradaIds.length === 0) return;
    const entradas = await tx.find(Entrada, { where: { id: In(entradaIds) } });
    for (const entrada of entradas) {
      await this.encolar(tx, EXCHANGE_VENTAS, CLAVE_ENTRADA_ACTUALIZADA, entradaActualizada(entrada));
    }
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
