import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import { REDIS } from './redis.provider';

/**
 * Libera el bloqueo **solo si sigue siendo nuestro**.
 *
 * Un `DEL` a secas tiene una carrera real: si nuestro checkout se demoró más
 * que el TTL, Redis ya expiró el bloqueo y otra persona pudo tomarlo. Borrarlo
 * entonces liberaría *el bloqueo de esa otra persona*, dejando la publicación
 * abierta para un tercero — justo la doble venta que RNF-01 prohíbe.
 *
 * Comparar y borrar tiene que ser atómico, y en Redis eso significa Lua: entre
 * un `GET` y un `DEL` hechos por separado cabe exactamente la misma carrera.
 */
const LIBERAR_SI_ES_MIO = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

/** Renueva el TTL solo si el bloqueo sigue siendo nuestro, por el mismo motivo. */
const RENOVAR_SI_ES_MIO = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface ResultadoBloqueo {
  adquirido: boolean;
  /** Si no se adquirió, quién lo tiene (el id de su transacción). Null si se liberó entretanto. */
  titularActual: string | null;
}

/**
 * Gestor de Concurrencia (SAD §9).
 *
 * Es el componente que el diagrama describe como *"Solicita el bloqueo temporal
 * de la entrada"* contra Redis, y la primera línea de defensa del **ASR-01**:
 * *"Dos compradores intentan adquirir simultáneamente la misma entrada
 * publicada en reventa; el sistema garantiza que solo uno complete la compra y
 * el otro reciba **de inmediato** un mensaje de no disponibilidad"*.
 *
 * "De inmediato" es la razón de que esto sea un bloqueo con `NX` y no una cola
 * de espera: el segundo comprador no espera turno, se le dice ya que no está
 * disponible.
 *
 * **Por qué Redis y no un `SELECT ... FOR UPDATE`.** El ADR-03 descartó
 * explícitamente el *"bloqueo pesimista directamente en la base de datos
 * relacional"* por convertirse en cuello de botella. Hay además una razón de
 * forma: el bloqueo del checkout dura lo que tarde una persona en pagar
 * —segundos o minutos—, y mantener abierta una transacción de base de datos
 * todo ese rato agotaría el pool de conexiones. El TTL de Redis, en cambio,
 * sobrevive a que el proceso muera y se limpia solo.
 */
@Injectable()
export class GestorConcurrencia implements OnModuleDestroy {
  private readonly log = new Logger(GestorConcurrencia.name);
  private readonly ttlMs: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.ttlMs = config.reventa.bloqueoTtlSegundos * 1000;
  }

  /** Espacio de nombres propio, para no chocar con el aforo y las sesiones que también viven en Redis (ADR-03). */
  private clave(publicacionId: string): string {
    return `reventa:bloqueo:publicacion:${publicacionId}`;
  }

  /**
   * Paso 6 del CU-006: *"Bloquear temporalmente la publicación para evitar
   * compras simultáneas"*.
   *
   * @param titular identificador único de quien bloquea (el id de su
   *   transacción). Es lo que después permite liberar solo lo propio; por eso
   *   no vale usar el id del comprador, que se repetiría entre intentos.
   */
  async bloquear(publicacionId: string, titular: string): Promise<ResultadoBloqueo> {
    const clave = this.clave(publicacionId);
    const resultado = await this.redis.set(clave, titular, 'PX', this.ttlMs, 'NX');

    if (resultado === 'OK') {
      this.log.debug(`Bloqueada ${publicacionId} por ${titular} durante ${this.ttlMs} ms`);
      return { adquirido: true, titularActual: titular };
    }

    // No se consiguió: alguien está comprando esta misma publicación (CU-006H).
    // Se devuelve quién la tiene para poder distinguir "otra persona" de "tú
    // mismo, desde otra pantalla".
    const titularActual = await this.redis.get(clave);
    this.log.log(`Bloqueo de ${publicacionId} denegado a ${titular}; lo tiene ${titularActual ?? 'nadie (expiró)'}`);
    return { adquirido: false, titularActual };
  }

  /** Libera el bloqueo. Devuelve true si era nuestro y se liberó. */
  async liberar(publicacionId: string, titular: string): Promise<boolean> {
    const borradas = await this.redis.eval(LIBERAR_SI_ES_MIO, 1, this.clave(publicacionId), titular);
    const liberado = borradas === 1;
    if (liberado) this.log.debug(`Liberada ${publicacionId} por ${titular}`);
    return liberado;
  }

  /**
   * Si el bloqueo de esta publicación sigue siendo de `titular`.
   *
   * **No basta con preguntar si existe un bloqueo.** Si el TTL de un checkout
   * vence, otra persona puede tomar la publicación de inmediato: a partir de
   * ese momento sigue habiendo bloqueo, pero es de otro. Dejar continuar al
   * primero porque "hay bloqueo" es lo que permite cobrar a alguien que ya
   * perdió su reserva — y, si ambos pagan a la vez, cobrar dos veces la misma
   * entrada.
   *
   * Se lee el valor, no solo la existencia, justamente por eso.
   */
  async esTitular(publicacionId: string, titular: string): Promise<boolean> {
    return (await this.redis.get(this.clave(publicacionId))) === titular;
  }

  /**
   * Extiende el bloqueo. Devuelve **false si ya no es nuestro**, y ese valor
   * hay que mirarlo: es la señal de que el checkout perdió su reserva mientras
   * el comprador se lo pensaba.
   */
  async renovar(publicacionId: string, titular: string): Promise<boolean> {
    const resultado = await this.redis.eval(
      RENOVAR_SI_ES_MIO,
      1,
      this.clave(publicacionId),
      titular,
      String(this.ttlMs),
    );
    return resultado === 1;
  }

  /**
   * Bloqueo para un trabajo periódico, de modo que solo una réplica lo ejecute.
   *
   * ASR-06 prevé varias instancias del servicio de Entradas corriendo a la vez.
   * Sin esto, cada una ejecutaría el mismo barrido de expiración a la misma
   * hora: trabajo repetido, contención sobre las mismas filas y un registro de
   * actividad multiplicado por el número de réplicas.
   *
   * Es el mismo mecanismo que el bloqueo del checkout —`SET NX` con TTL— pero
   * con su propio espacio de nombres y su propia vida: un trabajo no dura lo
   * que dura un pago.
   *
   * @param ttlMs cuánto se retiene el bloqueo. Debe superar lo que tarda el
   *   trabajo; si el proceso muere a mitad, el TTL lo libera solo y la
   *   siguiente ejecución lo retoma.
   */
  async bloquearTarea(nombre: string, ttlMs: number): Promise<string | null> {
    const testigo = crypto.randomUUID();
    const resultado = await this.redis.set(`reventa:tarea:${nombre}`, testigo, 'PX', ttlMs, 'NX');
    return resultado === 'OK' ? testigo : null;
  }

  /** Libera el bloqueo de un trabajo, solo si sigue siendo nuestro. */
  async liberarTarea(nombre: string, testigo: string): Promise<boolean> {
    const borradas = await this.redis.eval(LIBERAR_SI_ES_MIO, 1, `reventa:tarea:${nombre}`, testigo);
    return borradas === 1;
  }

  /** Milisegundos que le quedan al bloqueo, o null si no hay ninguno. */
  async tiempoRestanteMs(publicacionId: string): Promise<number | null> {
    const ttl = await this.redis.pttl(this.clave(publicacionId));
    // -2 = la clave no existe; -1 = existe sin caducidad (no debería pasar aquí).
    return ttl < 0 ? null : ttl;
  }

  /** Comprobación de vida de Redis, para la sonda del servicio. */
  async responde(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Cierre ordenado: al desplegar una versión nueva (RNF-15) el proceso debe
    // soltar la conexión en vez de dejarla colgando.
    await this.redis.quit();
  }
}
