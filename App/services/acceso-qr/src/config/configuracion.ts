import { cargarClavePublica, ClavePublica } from './clave-publica';

/**
 * Configuración de Acceso QR.
 *
 * Tiene base propia, pero pequeña: los ingresos, su proyección del evento con
 * el aforo y su copia de los QR. **No tiene la tabla de entradas**, que es de
 * Ventas; la copia de los QR le llega por el broker (ADR-15), así que validar
 * no depende de que Ventas responda.
 */

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
  if (!Number.isInteger(n)) throw new Error(`La variable ${nombre} debe ser un entero, llegó "${valor}"`);
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
    base: string;
  };
  /** Para comprobar que la sesión no fue revocada (ADR-11). */
  redis: { host: string; puerto: number };
  jwt: ClavePublica;
  emisorTokens: string;
  /** De aquí llegan `CompraConfirmada` y `EntradaActualizada` (ADR-15). */
  rabbitmq: { url: string };
}

export const CONFIGURACION = 'CONFIGURACION_SERVICIO';

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }

  return {
    entorno,
    puerto: entero('PUERTO', 3010),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      contrasena:
        entorno === 'production' ? requerido('POSTGRES_CONTRASENA') : texto('POSTGRES_CONTRASENA', 'hexacore'),
      base: texto('POSTGRES_BASE', 'acceso_qr'),
    },
    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      // 6380: el puerto en que lo expone App/infra/docker-compose.yml.
      puerto: entero('REDIS_PUERTO', 6380),
    },
    jwt: cargarClavePublica(entorno === 'production'),
    emisorTokens: texto('AUTH_JWT_EMISOR', 'hexacore-administracion'),
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
  };
}
