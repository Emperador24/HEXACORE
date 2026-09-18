import { cargarClavePublica, ClavePublica } from '../comun/autenticacion/clave-publica';

/**
 * Configuración del servicio, leída del entorno y validada al arrancar.
 *
 * Se valida en el arranque y no en el primer uso a propósito: un servicio mal
 * configurado debe negarse a arrancar, no fallar más tarde en mitad de un
 * checkout con el pago ya cobrado.
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

function numero(nombre: string, porDefecto: number): number {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n)) {
    throw new Error(`La variable ${nombre} debe ser numérica, llegó "${valor}"`);
  }
  return n;
}

function entero(nombre: string, porDefecto: number): number {
  const n = numero(nombre, porDefecto);
  if (!Number.isInteger(n)) {
    throw new Error(`La variable ${nombre} debe ser un entero, llegó "${n}"`);
  }
  return n;
}

export type Entorno = 'development' | 'test' | 'production';

export interface ConfiguracionServicio {
  entorno: Entorno;
  puerto: number;
  /** Prefijo de todas las rutas; el API Gateway (ADR-02) enruta por él. */
  prefijoApi: string;
  postgres: {
    host: string;
    puerto: number;
    usuario: string;
    contrasena: string;
    base: string;
  };
  redis: {
    host: string;
    puerto: number;
  };
  rabbitmq: {
    url: string;
  };
  pasarelaPagos: {
    /** URL del adaptador HTTP al proveedor de pagos. Es el único punto que cambia al sustituir de proveedor (RNF-16). */
    url: string;
    /** Corta la espera ante una pasarela lenta o caída — camino de excepción CU-006I (riesgo #3 del SAD §13). */
    timeoutMs: number;
  };
  reventa: ReglasReventa;
  /**
   * Verificación de los tokens de sesión (RNF-06). Solo la clave pública: este
   * servicio verifica tokens, no los emite.
   */
  autenticacion: {
    clavePublica: ClavePublica;
    /** Quién debe haber firmado el token. Contrato con el Servicio de Administración. */
    emisor: string;
  };
}

/**
 * Reglas de negocio de la reventa.
 *
 * NINGUNO de estos cuatro valores está fijado en la documentación del
 * proyecto: el CU-006 dice "Establece el precio de venta" sin tope, "Liquidar
 * el pago correspondiente al vendedor" sin porcentaje, y el flujo alterno
 * CU-006D ("la publicación expira sin haberse vendido") no da plazo; el TTL
 * del bloqueo Redis aparece en la tabla de riesgos del SAD §13 sin valor.
 *
 * Se dejan configurables —no constantes en el código— porque son decisiones de
 * producto pendientes de ratificar por el equipo, no verdades arquitectónicas.
 * El razonamiento de cada valor por defecto está en DECISIONES.md.
 */
export interface ReglasReventa {
  /** Tope del precio de reventa como múltiplo del precio original de la entrada. */
  topePrecioFactor: number;
  /** Porcentaje que retiene la plataforma al liquidar al vendedor (paso 13 del CU-006). */
  comisionPorcentaje: number;
  /** Vida del bloqueo de Redis durante el checkout (ADR-03, ASR-01). */
  bloqueoTtlSegundos: number;
  /**
   * Minutos antes del inicio del evento en que deja de poderse revender.
   * Es lo que hace expirar una publicación no vendida (CU-006D).
   */
  margenCierreMinutos: number;
}

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }

  const reventa: ReglasReventa = {
    topePrecioFactor: numero('REVENTA_TOPE_PRECIO_FACTOR', 1.5),
    comisionPorcentaje: numero('REVENTA_COMISION_PORCENTAJE', 10),
    bloqueoTtlSegundos: entero('REVENTA_BLOQUEO_TTL_SEGUNDOS', 120),
    margenCierreMinutos: entero('REVENTA_MARGEN_CIERRE_MINUTOS', 0),
  };

  if (reventa.topePrecioFactor < 1) {
    throw new Error(
      `REVENTA_TOPE_PRECIO_FACTOR debe ser >= 1 (llegó ${reventa.topePrecioFactor}): ` +
        'un tope por debajo del precio original haría irrevendible toda entrada',
    );
  }
  if (reventa.comisionPorcentaje < 0 || reventa.comisionPorcentaje >= 100) {
    throw new Error(
      `REVENTA_COMISION_PORCENTAJE debe estar en [0, 100) (llegó ${reventa.comisionPorcentaje})`,
    );
  }
  if (reventa.bloqueoTtlSegundos <= 0) {
    throw new Error(
      `REVENTA_BLOQUEO_TTL_SEGUNDOS debe ser > 0 (llegó ${reventa.bloqueoTtlSegundos}): ` +
        'un bloqueo sin vida no protege de la doble venta que prohíbe RNF-01',
    );
  }

  // Un bloqueo que caduque antes de que la pasarela responda dejaría la
  // publicación libre con un cobro en vuelo: exactamente la doble venta que
  // ASR-01 debe impedir.
  const timeoutPasarelaMs = entero('PASARELA_TIMEOUT_MS', 10_000);
  if (reventa.bloqueoTtlSegundos * 1000 <= timeoutPasarelaMs) {
    throw new Error(
      `REVENTA_BLOQUEO_TTL_SEGUNDOS (${reventa.bloqueoTtlSegundos}s) debe superar ` +
        `PASARELA_TIMEOUT_MS (${timeoutPasarelaMs}ms), o el bloqueo caducaría con el cobro en vuelo`,
    );
  }

  return {
    entorno,
    puerto: entero('PUERTO', 3001),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      contrasena: entorno === 'production' ? requerido('POSTGRES_CONTRASENA') : texto('POSTGRES_CONTRASENA', 'hexacore'),
      base: texto('POSTGRES_BASE', 'entradas_mercado_secundario'),
    },
    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      // 6380 y no 6379: es el puerto en que App/infra/docker-compose.yml lo
      // expone, para no chocar con un Redis instalado localmente.
      puerto: entero('REDIS_PUERTO', 6380),
    },
    rabbitmq: {
      url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672'),
    },
    pasarelaPagos: {
      url: texto('PASARELA_URL', 'http://localhost:3099'),
      timeoutMs: timeoutPasarelaMs,
    },
    reventa,
    autenticacion: {
      clavePublica: cargarClavePublica(entorno === 'production'),
      emisor: texto('AUTH_JWT_EMISOR', 'hexacore-administracion'),
    },
  };
}

/** Clave con la que se inyecta la configuración: `@Inject(CONFIGURACION)`. */
export const CONFIGURACION = 'CONFIGURACION_SERVICIO';
