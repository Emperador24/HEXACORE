import { cargarDestinoPostgres } from '../../../../compartido/config/postgres';

/** Configuración propia del módulo: libro y pasarela; sin JWT, Redis ni AMQP. */

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
  postgres: {
    host: string;
    puerto: number;
    usuario: string;
    contrasena: string;
    base: string;
    maxConexiones: number;
    esperaMaximaMs: number;
  };
  pasarelaPagos: {
    url: string;
    /** Corta la espera ante una pasarela lenta: sin esto, un cobro sin respuesta cuelga al llamante. */
    timeoutMs: number;
  };
}

export const CONFIGURACION = 'CONFIGURACION_FINANZAS_PAGOS';

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }
  const esperaMaximaMs = entero('POSTGRES_ESPERA_MAXIMA_MS', 3000);
  const maxConexiones = entero('POSTGRES_MAX_CONEXIONES', 10);
  if (maxConexiones < 2) throw new Error('POSTGRES_MAX_CONEXIONES debe ser >= 2');
  const pasarelaTimeoutMs = entero('PASARELA_TIMEOUT_MS', 10000);
  if (pasarelaTimeoutMs <= 0) throw new Error('PASARELA_TIMEOUT_MS debe ser mayor que 0');

  return {
    entorno,
    postgres: {
      ...cargarDestinoPostgres(),
      maxConexiones,
      esperaMaximaMs,
    },
    pasarelaPagos: {
      url: texto('PAGOS_PROVEEDOR_URL', 'http://localhost:3099'),
      timeoutMs: pasarelaTimeoutMs,
    },
  };
}
