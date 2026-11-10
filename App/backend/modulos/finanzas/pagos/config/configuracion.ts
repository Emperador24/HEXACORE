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
    /**
     * `simulada` es App/infra/pasarela-pagos-simulada; `stripe`, la API real de
     * Stripe (en modo de prueba con llaves `sk_test_`). Ver `pasarela-stripe.service.ts`.
     */
    proveedor: 'simulada' | 'stripe';
    url: string;
    /** Corta la espera ante una pasarela lenta: sin esto, un cobro sin respuesta cuelga al llamante. */
    timeoutMs: number;
    stripe: {
      url: string;
      claveSecreta: string;
      /** La que usa el navegador para tokenizar la tarjeta; se publica en GET /pagos/configuracion. */
      clavePublica: string;
      /** Firma de los webhooks (`whsec_…`). Opcional: sin ella no se aceptan webhooks de Stripe. */
      secretoWebhook: string;
    };
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

  const proveedor = texto('PAGOS_PROVEEDOR', 'simulada');
  if (proveedor !== 'simulada' && proveedor !== 'stripe') {
    throw new Error(`PAGOS_PROVEEDOR debe ser "simulada" o "stripe" (llegó "${proveedor}")`);
  }
  const stripe = {
    url: texto('STRIPE_API_URL', 'https://api.stripe.com/v1'),
    claveSecreta: texto('STRIPE_CLAVE_SECRETA', ''),
    clavePublica: texto('STRIPE_CLAVE_PUBLICA', ''),
    secretoWebhook: texto('STRIPE_SECRETO_WEBHOOK', ''),
  };
  if (proveedor === 'stripe') {
    // Mejor no arrancar que arrancar y rechazar cada cobro.
    if (!/^sk_(test|live)_/.test(stripe.claveSecreta)) {
      throw new Error('Con PAGOS_PROVEEDOR=stripe hace falta STRIPE_CLAVE_SECRETA (sk_test_…)');
    }
    if (!/^pk_(test|live)_/.test(stripe.clavePublica)) {
      throw new Error('Con PAGOS_PROVEEDOR=stripe hace falta STRIPE_CLAVE_PUBLICA (pk_test_…)');
    }
    if (stripe.claveSecreta.startsWith('sk_test_') !== stripe.clavePublica.startsWith('pk_test_')) {
      throw new Error('STRIPE_CLAVE_SECRETA y STRIPE_CLAVE_PUBLICA deben ser las dos de prueba o las dos reales');
    }
  }

  return {
    entorno,
    postgres: {
      ...cargarDestinoPostgres(),
      maxConexiones,
      esperaMaximaMs,
    },
    pasarelaPagos: {
      proveedor,
      url: texto('PAGOS_PROVEEDOR_URL', 'http://localhost:3099'),
      timeoutMs: pasarelaTimeoutMs,
      stripe,
    },
  };
}
