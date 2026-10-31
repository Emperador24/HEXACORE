import { cargarClavePublica, ClavePublica } from './clave-publica';

/**
 * Configuración del microservicio de Pagos.
 *
 * Es el único servicio que habla con la pasarela. Por eso los datos del
 * proveedor —URL y timeout— solo están aquí: sustituirlo deja de tocar dos
 * servicios, que es lo que pasaba cuando el adaptador vivía duplicado.
 *
 * Verifica tokens pero no los firma: lleva la clave pública y nada más
 * (ADR-11).
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
    base: string;
    maxConexiones: number;
    esperaMaximaMs: number;
  };
  /** Para comprobar que la sesión no fue revocada (ADR-11). */
  redis: { host: string; puerto: number };
  /** Solo la pública: este servicio verifica tokens, no los firma. */
  jwt: ClavePublica;
  emisorTokens: string;
  pasarelaPagos: {
    url: string;
    /** Corta la espera ante una pasarela lenta: sin esto, un cobro sin respuesta cuelga al llamante. */
    timeoutMs: number;
    /**
     * Secreto compartido con la pasarela para firmar el webhook (HMAC-SHA256).
     * Es lo único que autentica esa ruta: la pasarela no tiene sesión.
     */
    secretoWebhook: string;
  };
  /** Para publicar `PagoAprobado` / `PagoRechazado` (ADR-15). */
  rabbitmq: { url: string };
}

export const CONFIGURACION = 'CONFIGURACION_SERVICIO';

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
    puerto: entero('PUERTO', 3008),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      contrasena:
        entorno === 'production' ? requerido('POSTGRES_CONTRASENA') : texto('POSTGRES_CONTRASENA', 'hexacore'),
      base: texto('POSTGRES_BASE', 'pagos'),
      maxConexiones,
      esperaMaximaMs,
    },
    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      // 6380: el puerto en que lo expone App/infra/docker-compose.yml.
      puerto: entero('REDIS_PUERTO', 6380),
    },
    jwt: cargarClavePublica(entorno === 'production'),
    emisorTokens: texto('AUTH_JWT_EMISOR', 'hexacore-administracion'),
    pasarelaPagos: {
      url: texto('PAGOS_PROVEEDOR_URL', 'http://localhost:3099'),
      timeoutMs: pasarelaTimeoutMs,
      // En producción no hay valor por defecto: un secreto conocido dejaría a
      // cualquiera confirmar pagos que no hizo.
      secretoWebhook:
        entorno === 'production'
          ? requerido('PASARELA_SECRETO_WEBHOOK')
          : texto('PASARELA_SECRETO_WEBHOOK', 'secreto-webhook-desarrollo'),
    },
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
  };
}
