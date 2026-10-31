import { cargarClavePublica, ClavePublica } from './clave-publica';

/**
 * Configuración de la Cola virtual.
 *
 * **No tiene PostgreSQL**: su estado es la fila, y la fila vive en Redis. Un
 * turno que se pierde al reiniciar no es un dato perdido —el comprador vuelve
 * a pedir sitio—, y a cambio la cola aguanta el pico sin tocar disco.
 */

function texto(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === '' ? porDefecto : valor.trim();
}

function entero(nombre: string, porDefecto: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new Error(`La variable ${nombre} debe ser un entero, llegó "${valor}"`);
  return n;
}

export type Entorno = 'development' | 'test' | 'production';

export interface ReglasCola {
  /**
   * Cuántos compradores pueden estar comprando a la vez, por evento.
   *
   * Es el número que de verdad protege a Ventas: todo lo que pase de aquí
   * espera en la fila en vez de llegar al checkout. Ajustarlo es la palanca
   * del primer ASR, y el valor de partida se calibra con las pruebas de carga.
   */
  aforoConcurrente: number;
  /**
   * Vida del token de turno, en segundos.
   *
   * Corto a propósito: un turno que no se usa tiene que devolver el sitio a
   * quien espera. Si fuera largo, quien abre la pestaña y se va bloquearía un
   * hueco durante todo ese rato.
   *
   * Tiene que superar el tiempo del checkout completo, o alguien se quedaría
   * sin turno con el pago en vuelo.
   */
  turnoTtlSegundos: number;
  /** Cada cuánto se le dice al que espera que vuelva a preguntar. */
  reintentoSegundos: number;
  /**
   * Vida de una solicitud en espera. Quien no vuelve a preguntar en este
   * tiempo sale de la fila: sin esto, una pestaña cerrada ocuparía puesto
   * para siempre y la fila solo crecería.
   */
  esperaTtlSegundos: number;
}

export interface ConfiguracionServicio {
  entorno: Entorno;
  puerto: number;
  prefijoApi: string;
  redis: { host: string; puerto: number };
  jwt: ClavePublica;
  emisorTokens: string;
  cola: ReglasCola;
}

export const CONFIGURACION = 'CONFIGURACION_SERVICIO';

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }

  const cola: ReglasCola = {
    aforoConcurrente: entero('COLA_AFORO_CONCURRENTE', 100),
    turnoTtlSegundos: entero('COLA_TURNO_TTL_SEGUNDOS', 300),
    reintentoSegundos: entero('COLA_REINTENTO_SEGUNDOS', 5),
    esperaTtlSegundos: entero('COLA_ESPERA_TTL_SEGUNDOS', 60),
  };

  if (cola.aforoConcurrente < 1) throw new Error('COLA_AFORO_CONCURRENTE debe ser >= 1');
  if (cola.turnoTtlSegundos < 1) throw new Error('COLA_TURNO_TTL_SEGUNDOS debe ser >= 1');
  // Si el que espera vuelve más tarde de lo que dura su sitio en la fila, se
  // encontraría fuera cada vez y nunca avanzaría.
  if (cola.esperaTtlSegundos <= cola.reintentoSegundos) {
    throw new Error(
      `COLA_ESPERA_TTL_SEGUNDOS (${cola.esperaTtlSegundos}s) debe superar ` +
        `COLA_REINTENTO_SEGUNDOS (${cola.reintentoSegundos}s), o quien espera caería de la fila entre consulta y consulta`,
    );
  }

  return {
    entorno,
    puerto: entero('PUERTO', 3009),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      // 6380: el puerto en que lo expone App/infra/docker-compose.yml.
      puerto: entero('REDIS_PUERTO', 6380),
    },
    jwt: cargarClavePublica(entorno === 'production'),
    emisorTokens: texto('AUTH_JWT_EMISOR', 'hexacore-administracion'),
    cola,
  };
}
