import { cargarConfiguracionProceso } from '../../../../compartido/config/configuracion';
import { cargarClavePublica, ClavePublica } from '../../../../compartido/seguridad/clave-publica';

/** Configuración de alimentos: token propio y base actual; el proceso se configura en compartido/config. */

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Falta la variable de entorno ${nombre} (ver .env.example)`);
  }
  return valor.trim();
}

function texto(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === '' ? porDefecto : valor.trim();
}

function entero(nombre: string, porDefecto: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n)) {
    throw new Error(`La variable ${nombre} debe ser un entero, llegó "${valor}"`);
  }
  return n;
}

export type Entorno = 'development' | 'test' | 'production';

export interface ConfiguracionServicio {
  entorno: Entorno;
  puerto: number;
  prefijoApi: string;
  postgres: {
    host: string;
    puerto: number;
    usuario: string;
    contrasena: string;
    /** Conexiones del pool. */
    maxConexiones: number;
    /** Cuánto se espera a la base antes de rendirse, en ms. */
    esperaMaximaMs: number;
    /** Base actual de Alimentos; se conserva durante esta transición. */
    base: string;
  };
  rabbitmq: { url: string };
  redis: { host: string; puerto: number };
  /**
   * Solo la clave pública. Este servicio **verifica** tokens y no los firma:
   * si se viera comprometido, no podría fabricar uno (ADR-11). La privada se
   * quedó en Autenticación, que es la única que firma.
   */
  jwt: ClavePublica;
  /** Emisor que se exige en el token; cualquier otro se rechaza. */
  emisorTokens: string;

}

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }

  const esperaMaximaMs = entero('POSTGRES_ESPERA_MAXIMA_MS', 3000);
  if (esperaMaximaMs < 500 || esperaMaximaMs > 30000) {
    throw new Error(`POSTGRES_ESPERA_MAXIMA_MS debe estar entre 500 y 30000 (llegó ${esperaMaximaMs})`);
  }
  const maxConexiones = entero('POSTGRES_MAX_CONEXIONES', 10);
  if (maxConexiones < 2) {
    throw new Error('POSTGRES_MAX_CONEXIONES debe ser >= 2');
  }

  return {
    entorno,
    puerto: cargarConfiguracionProceso().puerto,
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      contrasena:
        entorno === 'production' ? requerido('POSTGRES_CONTRASENA') : texto('POSTGRES_CONTRASENA', 'hexacore'),
      maxConexiones,
      esperaMaximaMs,
      base: texto('POSTGRES_BD_PEDIDOS', 'pedidos'),
    },
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      // 6380: el puerto en que lo expone App/infra/docker-compose.yml.
      puerto: entero('REDIS_PUERTO', 6380),
    },
    jwt: cargarClavePublica(entorno === 'production'),
    emisorTokens: texto('AUTH_JWT_EMISOR', 'hexacore-administracion'),
  };
}

/** Clave con la que se inyecta la configuración: `@Inject(CONFIGURACION)`. */
export const CONFIGURACION = 'CONFIGURACION_ALIMENTOS';
