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
    /**
     * `simulado` usa el buzón de App/infra/correo-simulado; `smtp`, un servidor
     * real (Gmail con contraseña de aplicación). Ver `correos/enviador-correo.ts`.
     */
    proveedor: 'simulado' | 'smtp';
    /** Adaptador HTTP al proveedor simulado. */
    urlProveedor: string;
    smtp: {
      host: string;
      puerto: number;
      /** TLS desde el primer byte (465). Con 587 va en false y se negocia STARTTLS. */
      seguro: boolean;
      usuario: string;
      contrasena: string;
      remitente: string;
    };
    /** Base de los enlaces de verificación y recuperación que van en el cuerpo. */
    urlBaseEnlaces: string;
  };
  seguridad: {
    /** Minutos de bloqueo tras varios intentos fallidos; se nombra en el correo de aviso. */
    bloqueoMinutos: number;
  };
}

export const CONFIGURACION = 'CONFIGURACION_COMUNICACIONES';

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  const bloqueoMinutos = entero('AUTH_BLOQUEO_MINUTOS', 15);
  if (bloqueoMinutos <= 0) {
    throw new Error(`AUTH_BLOQUEO_MINUTOS debe ser > 0 (llegó ${bloqueoMinutos})`);
  }

  const proveedor = texto('CORREO_PROVEEDOR', 'simulado');
  if (proveedor !== 'simulado' && proveedor !== 'smtp') {
    throw new Error(`CORREO_PROVEEDOR debe ser "simulado" o "smtp" (llegó "${proveedor}")`);
  }
  const puertoSmtp = entero('SMTP_PUERTO', 465);
  const smtp = {
    host: texto('SMTP_HOST', 'smtp.gmail.com'),
    puerto: puertoSmtp,
    seguro: texto('SMTP_SEGURO', puertoSmtp === 465 ? 'true' : 'false') === 'true',
    usuario: texto('SMTP_USUARIO', ''),
    // Las contraseñas de aplicación de Gmail se muestran en grupos de cuatro
    // con espacios; se aceptan copiadas tal cual.
    contrasena: texto('SMTP_CONTRASENA', '').replace(/\s+/g, ''),
    remitente: '',
  };
  smtp.remitente = texto('CORREO_REMITENTE', smtp.usuario);
  if (proveedor === 'smtp' && (!smtp.usuario || !smtp.contrasena)) {
    // Mejor no arrancar que arrancar y dejar todos los correos en la DLQ.
    throw new Error('Con CORREO_PROVEEDOR=smtp hacen falta SMTP_USUARIO y SMTP_CONTRASENA');
  }

  return {
    entorno,
    puerto: entero('PUERTO', 3006),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
    correo: {
      proveedor,
      urlProveedor: texto('CORREO_PROVEEDOR_URL', 'http://localhost:3098'),
      smtp,
      urlBaseEnlaces: texto('CORREO_URL_BASE_ENLACES', 'http://localhost:4200/cuenta'),
    },
    seguridad: { bloqueoMinutos },
  };
}
