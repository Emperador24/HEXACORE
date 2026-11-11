import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { DeepPartial, EntityManager, EntityTarget, FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { CLAVES, EXCHANGE_EVENTOS, MensajeEvento } from '../../eventos-recintos/eventos/contrato';
import { MAXIMO_INTENTOS } from './eventos-reventa';

export type { MensajeEvento };

const EXCHANGE_MUERTOS = 'eventos.gestion.muertos';

/**
 * Base de los consumidores de los cambios de un evento (CU-026 → CU-001/003/005/006).
 *
 * Núcleo publica en `eventos.gestion` cada vez que un evento se publica, se
 * edita estando publicado o se cancela (ver `eventos-recintos/CONTRATO-EVENTOS.md`).
 * Cada módulo de Boletería tiene su propia copia del evento y su propia cola
 * durable con DLQ, atada a las tres claves: así un módulo caído no frena a los
 * demás y, al volver, encuentra sus mensajes esperándolo.
 *
 * La entrega es "al menos una vez" y puede llegar desordenada tras un
 * reintento, así que `aplicar` tiene que ser idempotente y descartar una
 * `versionEvento` menor o igual a la que ya aplicó.
 */
export abstract class ConsumidorEventosGestion implements OnApplicationBootstrap {
  protected readonly log = new Logger(this.constructor.name);
  private readonly intentos = new Map<string, number>();

  /** Nombre de la cola propia del módulo, p. ej. `catalogo.eventos`. */
  protected abstract readonly cola: string;

  constructor(private readonly conexion: ConexionRabbitMq) {}

  /** Aplica el mensaje a la copia del módulo. Si lanza, se reintenta y luego va a la DLQ. */
  abstract aplicar(mensaje: MensajeEvento): Promise<void>;

  async onApplicationBootstrap(): Promise<void> {
    this.conexion.registrarAlReconectar(() => this.preparar());
    await this.preparar();
  }

  private async preparar(): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!canal) return; // la conexión se reintenta sola y avisa al volver
    try {
      await declararTopologia(canal, this.cola);
      await this.conexion.consumir(this.cola, (mensaje) => {
        if (mensaje) {
          return this.recibir(canal, mensaje).catch((error: unknown) =>
            this.log.error(`Fallo no controlado en ${this.cola}: ${error instanceof Error ? error.message : error}`),
          );
        }
      });
      this.log.log(`Escuchando ${this.cola}`);
    } catch (error) {
      this.log.error(`No se pudo preparar ${this.cola}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async recibir(canal: ConfirmChannel, mensaje: ConsumeMessage): Promise<void> {
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(mensaje.content.toString());
    } catch {
      cuerpo = null;
    }
    if (!esMensajeEvento(cuerpo)) {
      this.log.error(`Mensaje ilegible en ${this.cola}; va a la DLQ`);
      return cerrar(canal, mensaje, 'dlq');
    }

    try {
      await this.aplicar(cuerpo);
      this.intentos.delete(cuerpo.id);
      cerrar(canal, mensaje, 'ack');
    } catch (error) {
      const fallos = (this.intentos.get(cuerpo.id) ?? 0) + 1;
      const causa = error instanceof Error ? error.message : String(error);
      if (fallos >= MAXIMO_INTENTOS) {
        this.intentos.delete(cuerpo.id);
        this.log.error(`${cuerpo.tipo} ${cuerpo.eventoId} falló ${fallos} veces (${causa}); va a la DLQ`);
        return cerrar(canal, mensaje, 'dlq');
      }
      this.intentos.set(cuerpo.id, fallos);
      cerrar(canal, mensaje, 'reintentar');
    }
  }
}

/**
 * Escribe la copia del evento si el mensaje es más nuevo que lo aplicado.
 * Devuelve `false` cuando ya estaba aplicado (repetido o desordenado). La fila
 * se bloquea para que dos entregas del mismo evento no se pisen; si aún no
 * existe, la clave primaria hace de árbitro y el perdedor se reintenta.
 */
export async function guardarCopiaEvento<T extends { eventoId: string; versionEvento: number }>(
  m: EntityManager,
  entidad: EntityTarget<T>,
  mensaje: MensajeEvento,
  campos: Partial<T>,
): Promise<boolean> {
  const actual = await m.findOne(entidad, {
    where: { eventoId: mensaje.eventoId } as FindOptionsWhere<T>,
    lock: { mode: 'pessimistic_write' },
  });
  if (actual && actual.versionEvento >= mensaje.versionEvento) return false;
  await m.save(entidad, { ...(actual ?? {}), ...campos, eventoId: mensaje.eventoId, versionEvento: mensaje.versionEvento } as DeepPartial<T>);
  return true;
}

/** Estado que debe quedar en la copia: un mensaje de cancelación manda aunque el cuerpo diga otra cosa. */
export function estadoDe(mensaje: MensajeEvento): 'PUBLICADO' | 'CANCELADO' {
  return mensaje.tipo === 'EVENTO_CANCELADO' || mensaje.evento.estado === 'CANCELADO' ? 'CANCELADO' : 'PUBLICADO';
}

/**
 * Upsert de los tipos de entrada (`cantidad` → `aforo`) sin tocar `vendidas`
 * ni `reservadas`. Núcleo no deja quitar ni reducir un tipo de entrada de un
 * evento publicado, así que el `aforo` nunca baja de lo ya vendido.
 */
export async function guardarLocalidades(m: EntityManager, entidad: EntityTarget<ObjectLiteral>, mensaje: MensajeEvento): Promise<void> {
  if (mensaje.localidades.length === 0) return;
  await m
    .createQueryBuilder()
    .insert()
    .into(entidad)
    .values(
      mensaje.localidades.map((l) => ({
        localidadId: l.localidadId,
        eventoId: mensaje.eventoId,
        nombre: l.nombre,
        precio: l.precio,
        aforo: l.cantidad,
        orden: l.orden,
      })),
    )
    .orUpdate(['nombre', 'precio', 'aforo', 'orden'], ['localidad_id'])
    .execute();
}

/** Valida la forma del mensaje antes de tocar la base: lo que no la cumple no se reintenta. */
export function esMensajeEvento(cuerpo: unknown): cuerpo is MensajeEvento {
  const m = cuerpo as Partial<MensajeEvento> | null;
  return (
    !!m &&
    m.versionContrato === 1 &&
    typeof m.id === 'string' &&
    typeof m.eventoId === 'string' &&
    typeof m.versionEvento === 'number' &&
    typeof m.tipo === 'string' &&
    m.tipo in CLAVES &&
    !!m.evento &&
    typeof m.evento.nombre === 'string' &&
    typeof m.evento.fechaInicio === 'string' &&
    Array.isArray(m.localidades)
  );
}

function cerrar(canal: ConfirmChannel, mensaje: ConsumeMessage, accion: 'ack' | 'dlq' | 'reintentar'): void {
  try {
    if (accion === 'ack') canal.ack(mensaje);
    else canal.nack(mensaje, false, accion === 'reintentar');
  } catch {
    // Canal cerrado entretanto: el mensaje se reentregará al reconectar.
  }
}

async function declararTopologia(canal: ConfirmChannel, cola: string): Promise<void> {
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_MUERTOS, 'topic', { durable: true });
  const muertos = `${cola}.dlq`;
  await canal.assertQueue(muertos, { durable: true });
  await canal.bindQueue(muertos, EXCHANGE_MUERTOS, cola);
  await canal.assertQueue(cola, { durable: true, deadLetterExchange: EXCHANGE_MUERTOS, deadLetterRoutingKey: cola });
  for (const clave of Object.values(CLAVES)) await canal.bindQueue(cola, EXCHANGE_EVENTOS, clave);
}
