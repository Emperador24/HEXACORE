import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';
import { REDIS } from '../comun/redis/redis.module';
import { CONSUMIR_TURNO, PEDIR_TURNO } from './guiones';
import { EstadoTurno, TurnoDto } from './dto/cola.dto';

/** Claves de un evento. El prefijo las separa de las de inventario y sesiones, que comparten Redis. */
const admitidos = (eventoId: string): string => `cola:${eventoId}:admitidos`;
const espera = (eventoId: string): string => `cola:${eventoId}:espera`;
/** Turno vigente de cada usuario: hace falta para no dar dos sitios al mismo. */
const porUsuario = (eventoId: string): string => `cola:${eventoId}:por-usuario`;
/**
 * De qué evento y de quién es un token. El gateway gasta el turno solo con el
 * token —no sabe de qué evento es la localidad que se compra—, y esto es lo
 * que le permite hacerlo.
 */
const duenoTurno = (token: string): string => `cola:turno:${token}`;

@Injectable()
export class ColaService {
  private readonly log = new Logger(ColaService.name);

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Pide sitio para comprar en un evento.
   *
   * La identidad de la solicitud es el usuario, no una petición: pedir turno
   * dos veces desde dos pestañas da el mismo sitio. Si fuera por petición,
   * abrir pestañas sería una forma de colarse.
   */
  async pedirTurno(eventoId: string, usuarioId: string): Promise<TurnoDto> {
    const { aforoConcurrente, turnoTtlSegundos, reintentoSegundos, esperaTtlSegundos } = this.config.cola;
    const solicitud = `${eventoId}:${usuarioId}`;
    const token = randomUUID();

    const bruto = await this.ejecutar(PEDIR_TURNO, [admitidos(eventoId), espera(eventoId), porUsuario(eventoId)], [
      String(Date.now()),
      String(aforoConcurrente),
      solicitud,
      token,
      String(turnoTtlSegundos * 1000),
      String(esperaTtlSegundos * 1000),
    ]);

    if (bruto.estado === 'ADMITIDO') {
      const expiraEn = Number(bruto.expiraEn);
      if (typeof bruto.token !== 'string' || !Number.isSafeInteger(expiraEn)) {
        throw new ServiceUnavailableException({ codigo: 'COLA_RESULTADO_INCIERTO' });
      }
      // Fuera del guion a propósito: en un clúster Redis un guion solo puede
      // tocar claves del mismo nodo, y esta va por token, no por evento. No
      // necesita ser atómica con la admisión: el turno solo se gasta si
      // también está entre los admitidos, que es lo que decide el guion.
      await this.recordarDueno(bruto.token, eventoId, usuarioId, expiraEn);
      return {
        estado: EstadoTurno.ADMITIDO,
        token: bruto.token,
        expiraEn: new Date(expiraEn).toISOString(),
        posicion: null,
        reintentarEnSegundos: null,
      };
    }

    if (bruto.estado === 'EN_ESPERA') {
      const posicion = Number(bruto.posicion);
      if (!Number.isSafeInteger(posicion) || posicion < 1) {
        throw new ServiceUnavailableException({ codigo: 'COLA_RESULTADO_INCIERTO' });
      }
      return {
        estado: EstadoTurno.EN_ESPERA,
        token: null,
        expiraEn: null,
        posicion,
        reintentarEnSegundos: reintentoSegundos,
      };
    }

    throw new ServiceUnavailableException({ codigo: 'COLA_RESULTADO_INCIERTO' });
  }

  /**
   * Gasta un turno sabiendo su evento.
   *
   * Devuelve `false` en vez de lanzar cuando el turno no vale: no es un fallo
   * del sistema, es la respuesta —"este no tiene turno"—.
   */
  async consumirTurno(eventoId: string, token: string): Promise<boolean> {
    const bruto = await this.ejecutar(CONSUMIR_TURNO, [admitidos(eventoId)], [String(Date.now()), token]);
    return bruto.codigo === 'OK';
  }

  /**
   * Gasta un turno con solo el token. Lo pide el API Gateway al dejar pasar
   * una compra (ADR-15).
   *
   * El turno tiene que ser **de quien compra**: un token copiado de otra
   * cuenta no sirve. Devuelve el evento del turno, o `null` si no vale — sin
   * decir por qué, para no confirmarle a nadie que un token ajeno existe.
   */
  async consumirTurnoDe(token: string, usuarioId: string): Promise<string | null> {
    let dueno: string | null;
    try {
      dueno = await this.redis.get(duenoTurno(token));
    } catch (error) {
      this.log.error(`La fila no respondió: ${error instanceof Error ? error.message : 'desconocido'}`);
      throw new ServiceUnavailableException({ codigo: 'COLA_NO_DISPONIBLE' });
    }
    if (!dueno) return null;
    const [eventoId, propietario] = dueno.split('|');
    if (propietario !== usuarioId) return null;

    if (!(await this.consumirTurno(eventoId, token))) return null;
    await this.redis.del(duenoTurno(token)).catch(() => undefined); // caduca solo si esto falla
    return eventoId;
  }

  /** Cuántos están comprando y cuántos esperan. Para operar y para las pruebas de carga. */
  async estado(eventoId: string): Promise<{ comprando: number; enEspera: number }> {
    const ahora = Date.now();
    const [comprando, enEspera] = await Promise.all([
      this.redis.zcount(admitidos(eventoId), ahora, '+inf'),
      this.redis.zcard(espera(eventoId)),
    ]);
    return { comprando, enEspera };
  }

  private async recordarDueno(token: string, eventoId: string, usuarioId: string, expiraEn: number): Promise<void> {
    const vidaMs = Math.max(expiraEn - Date.now(), 1);
    try {
      await this.redis.set(duenoTurno(token), `${eventoId}|${usuarioId}`, 'PX', vidaMs);
    } catch (error) {
      this.log.error(`La fila no respondió: ${error instanceof Error ? error.message : 'desconocido'}`);
      throw new ServiceUnavailableException({ codigo: 'COLA_NO_DISPONIBLE' });
    }
  }

  private async ejecutar(guion: string, claves: string[], args: string[]): Promise<Record<string, unknown>> {
    try {
      const respuesta = await this.redis.eval(guion, claves.length, ...claves, ...args);
      const resultado = JSON.parse(String(respuesta));
      if (!resultado || typeof resultado !== 'object') throw new Error('respuesta inválida');
      return resultado as Record<string, unknown>;
    } catch (error) {
      // Sin Redis no hay fila, y dejar pasar a todos sería quitar justo la
      // protección que este servicio es. Se falla cerrado.
      this.log.error(`La fila no respondió: ${error instanceof Error ? error.message : 'desconocido'}`);
      throw new ServiceUnavailableException({ codigo: 'COLA_NO_DISPONIBLE' });
    }
  }
}
