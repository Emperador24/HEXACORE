/**
 * Configuración del servicio de Notificaciones.
 *
 * Es corta porque el servicio hace una sola cosa: consumir de la cola y
 * llamar al proveedor de correo. **No tiene base de datos** —su estado es la
 * propia cola— y por eso no hay nada de PostgreSQL aquí.
 */

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
  rabbitmq: { url: string };
  correo: {
    /** Adaptador HTTP al proveedor. Es el único punto que cambia al sustituirlo (RNF-16). */
    urlProveedor: string;
    /** Base de los enlaces de verificación y recuperación que van en el cuerpo. */
    urlBaseEnlaces: string;
  };
  seguridad: {
    /** Minutos de bloqueo tras varios intentos fallidos; se nombra en el correo de aviso. */
    bloqueoMinutos: number;
  };
}

export const CONFIGURACION = 'CONFIGURACION_SERVICIO';

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  const bloqueoMinutos = entero('AUTH_BLOQUEO_MINUTOS', 15);
  if (bloqueoMinutos <= 0) {
    throw new Error(`AUTH_BLOQUEO_MINUTOS debe ser > 0 (llegó ${bloqueoMinutos})`);
  }

  return {
    entorno,
    puerto: entero('PUERTO', 3006),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
    correo: {
      urlProveedor: texto('CORREO_PROVEEDOR_URL', 'http://localhost:3098'),
      urlBaseEnlaces: texto('CORREO_URL_BASE_ENLACES', 'http://localhost:4200/cuenta'),
    },
    seguridad: { bloqueoMinutos },
  };
}
