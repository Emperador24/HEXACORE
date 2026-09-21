/**
 * Configuración del servicio de Pedidos, leída del entorno y validada
 * durante el arranque.
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

  if (valor === undefined || valor.trim() === '') {
    return porDefecto;
  }

  const numero = Number(valor);

  if (!Number.isInteger(numero)) {
    throw new Error(
      `La variable ${nombre} debe ser un entero, llegó "${valor}"`,
    );
  }

  return numero;
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
    maxConexiones: number;
    esperaMaximaMs: number;
  };

  redis: {
    host: string;
    puerto: number;
  };

  rabbitmq: {
    url: string;
  };

  pasarelaPagos: {
    url: string;
    timeoutMs: number;
  };
}

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;

  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }

  const postgresMaxConexiones = entero('POSTGRES_MAX_CONEXIONES', 10);
  const postgresEsperaMaximaMs = entero('POSTGRES_ESPERA_MAXIMA_MS', 3000);
  const pasarelaTimeoutMs = entero('PASARELA_TIMEOUT_MS', 10000);

  if (postgresMaxConexiones <= 0) {
    throw new Error('POSTGRES_MAX_CONEXIONES debe ser mayor que 0');
  }

  if (postgresEsperaMaximaMs <= 0) {
    throw new Error('POSTGRES_ESPERA_MAXIMA_MS debe ser mayor que 0');
  }

  if (pasarelaTimeoutMs <= 0) {
    throw new Error('PASARELA_TIMEOUT_MS debe ser mayor que 0');
  }

  return {
    entorno,

    puerto: entero('PUERTO', 3003),

    prefijoApi: texto('PREFIJO_API', 'api/v1'),

    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      contrasena:
        entorno === 'production'
          ? requerido('POSTGRES_CONTRASENA')
          : texto('POSTGRES_CONTRASENA', 'hexacore'),
      base: texto('POSTGRES_BASE', 'pedidos'),
      maxConexiones: postgresMaxConexiones,
      esperaMaximaMs: postgresEsperaMaximaMs,
    },

    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      puerto: entero('REDIS_PUERTO', 6380),
    },

    rabbitmq: {
      url: texto(
        'RABBITMQ_URL',
        'amqp://hexacore:hexacore@localhost:5672',
      ),
    },

    pasarelaPagos: {
      url: texto('PAGOS_PROVEEDOR_URL', 'http://localhost:3099'),
      timeoutMs: pasarelaTimeoutMs,
    },
  };
}

/**
 * Token utilizado por NestJS para inyectar la configuración
 * en los distintos módulos del servicio.
 */
export const CONFIGURACION = 'CONFIGURACION_SERVICIO';