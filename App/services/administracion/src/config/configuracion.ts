import { cargarClavesJwt, ClavesJwt } from './claves-jwt';

/**
 * Configuración del Servicio de Administración, leída del entorno y validada
 * al arrancar.
 *
 * Aquí la validación temprana importa aún más que en el servicio de Entradas:
 * una clave de firma conocida o una política de contraseñas laxa no se
 * manifiestan como un fallo, sino como un sistema que *parece* funcionar
 * mientras acepta credenciales que no debería. Un servicio mal configurado se
 * niega a arrancar.
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

/**
 * Reglas de seguridad de las cuentas.
 *
 * El CU-027 exige "contraseñas cifradas (hash + salt), tokens de sesión con
 * expiración, bloqueo ante fuerza bruta", y su post-condición 2 habla de un
 * token que *"expira según la política de seguridad"* — pero **no fija ni un
 * solo valor**. Igual que con el CU-006, se dejan configurables y razonados en
 * DECISIONES.md, no incrustados en el código.
 */
export interface ReglasSeguridad {
  /** Longitud mínima de contraseña (paso 2: "valida la fortaleza de la contraseña"). */
  longitudMinimaContrasena: number;
  /**
   * Cuánto vive un **token de acceso**, en minutos. Se renueva solo con el token
   * de renovación, así que no es cuánto dura la sesión (DECISIONES.md §21).
   */
  sesionMinutos: number;
  /**
   * Cuántos días puede pasar una sesión **sin usarse** antes de caducar. Cada
   * renovación reinicia la cuenta; no hay tope absoluto (DECISIONES.md §21).
   */
  renovacionDias: number;
  /** Intentos fallidos consecutivos antes de bloquear la cuenta — CU-027D. */
  intentosAntesDeBloquear: number;
  /** Cuánto dura ese bloqueo, en minutos. */
  bloqueoMinutos: number;
  /** Vida del enlace de verificación de cuenta (paso 5), en horas. */
  verificacionHoras: number;
  /** Vida del enlace de recuperación de contraseña — CU-027A, en minutos. */
  recuperacionMinutos: number;
}

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
    /** Conexiones del pool. */
    maxConexiones: number;
    /**
     * Cuánto se espera a la base antes de rendirse, en ms: tanto para obtener
     * una conexión como para que una consulta responda. Sin esto, una base
     * colgada dejaba el login sin responder indefinidamente (medido: más de
     * 40 s). Ver DECISIONES.md §17.
     */
    esperaMaximaMs: number;
  };
  rabbitmq: { url: string };
  correo: {
    /** Proveedor de Notificaciones. Es un sistema externo del SAD; en desarrollo, el simulador. */
    urlProveedor: string;
    /**
     * Base de los enlaces que viajan en los correos.
     *
     * Apunta al frontend, no a este servicio: quien abre el enlace ve una
     * pantalla, y es esa pantalla la que llama a la API. Enviar la URL de la
     * API produciría un JSON en el navegador.
     */
    urlBaseEnlaces: string;
  };
  /**
   * Claves con las que se firman (privada) y verifican (pública) los tokens.
   *
   * Quien tenga la privada puede fabricar un token de cualquier usuario,
   * incluido un administrador: solo la tiene este servicio. Ver
   * `claves-jwt.ts` y DECISIONES.md §7.
   */
  jwt: ClavesJwt;
  /**
   * Redis (ADR-03): aquí se publican las sesiones revocadas, para que el resto
   * de microservicios dejen de aceptarlas sin tener que preguntar a este.
   */
  redis: { host: string; puerto: number };
  seguridad: ReglasSeguridad;
}

export function cargarConfiguracion(): ConfiguracionServicio {
  const entorno = texto('NODE_ENV', 'development') as Entorno;
  if (!['development', 'test', 'production'].includes(entorno)) {
    throw new Error(`NODE_ENV inválido: "${entorno}"`);
  }

  const seguridad: ReglasSeguridad = {
    longitudMinimaContrasena: entero('AUTH_LONGITUD_MINIMA_CONTRASENA', 10),
    sesionMinutos: entero('AUTH_SESION_MINUTOS', 15),
    renovacionDias: entero('AUTH_RENOVACION_DIAS', 30),
    intentosAntesDeBloquear: entero('AUTH_INTENTOS_ANTES_DE_BLOQUEAR', 5),
    bloqueoMinutos: entero('AUTH_BLOQUEO_MINUTOS', 15),
    verificacionHoras: entero('AUTH_VERIFICACION_HORAS', 24),
    recuperacionMinutos: entero('AUTH_RECUPERACION_MINUTOS', 30),
  };

  // El NIST desaconseja exigir símbolos y mayúsculas —empuja a las personas a
  // "Password1!"— y recomienda apoyarse en la longitud. Ocho es el mínimo que
  // sigue considerándose aceptable; por debajo, la comprobación de fortaleza
  // del paso 2 del CU-027 sería decorativa.
  if (seguridad.longitudMinimaContrasena < 8) {
    throw new Error(
      `AUTH_LONGITUD_MINIMA_CONTRASENA debe ser >= 8 (llegó ${seguridad.longitudMinimaContrasena})`,
    );
  }
  // Con renovación, el token de acceso debe ser corto: es lo que acota cuánto
  // sirve uno robado y cuánto tarda en notarse un cambio de roles en el resto
  // de servicios, que se fían de él sin preguntar.
  if (seguridad.sesionMinutos <= 0 || seguridad.sesionMinutos > 60) {
    throw new Error(
      `AUTH_SESION_MINUTOS debe estar entre 1 y 60 (llegó ${seguridad.sesionMinutos}): ` +
        'para sesiones largas está el token de renovación',
    );
  }
  if (seguridad.renovacionDias < 1 || seguridad.renovacionDias > 365) {
    throw new Error(`AUTH_RENOVACION_DIAS debe estar entre 1 y 365 (llegó ${seguridad.renovacionDias})`);
  }
  // Un solo intento bloquearía a cualquiera que se equivoque al teclear;
  // sin límite, CU-027D no existe.
  if (seguridad.intentosAntesDeBloquear < 3) {
    throw new Error(
      `AUTH_INTENTOS_ANTES_DE_BLOQUEAR debe ser >= 3 (llegó ${seguridad.intentosAntesDeBloquear}): ` +
        'un umbral más bajo bloquea a quien simplemente se equivoca al teclear',
    );
  }
  if (seguridad.bloqueoMinutos <= 0) {
    throw new Error(
      `AUTH_BLOQUEO_MINUTOS debe ser > 0 (llegó ${seguridad.bloqueoMinutos}): ` +
        'un bloqueo de duración cero no frena un ataque de fuerza bruta',
    );
  }
  // El enlace de recuperación da acceso a la cuenta: cuanto más vive, más
  // tiempo sirve si alguien accede al correo de la víctima.
  if (seguridad.recuperacionMinutos > 1440) {
    throw new Error(
      `AUTH_RECUPERACION_MINUTOS no debería superar 24 h (llegó ${seguridad.recuperacionMinutos})`,
    );
  }

  const jwt = cargarClavesJwt(entorno === 'production');

  const esperaMaximaMs = entero('POSTGRES_ESPERA_MAXIMA_MS', 3000);
  // Por debajo de medio segundo, una consulta normal bajo carga podría
  // cortarse; por encima de 30 s, el login dejaría de "responder" en cualquier
  // sentido útil para quien espera delante de la pantalla.
  if (esperaMaximaMs < 500 || esperaMaximaMs > 30_000) {
    throw new Error(`POSTGRES_ESPERA_MAXIMA_MS debe estar entre 500 y 30000 (llegó ${esperaMaximaMs})`);
  }
  if (entero('POSTGRES_MAX_CONEXIONES', 10) < 2) {
    throw new Error('POSTGRES_MAX_CONEXIONES debe ser >= 2');
  }

  return {
    entorno,
    puerto: entero('PUERTO', 3002),
    prefijoApi: texto('PREFIJO_API', 'api/v1'),
    postgres: {
      host: texto('POSTGRES_HOST', 'localhost'),
      puerto: entero('POSTGRES_PUERTO', 5432),
      usuario: texto('POSTGRES_USUARIO', 'hexacore'),
      contrasena:
        entorno === 'production' ? requerido('POSTGRES_CONTRASENA') : texto('POSTGRES_CONTRASENA', 'hexacore'),
      base: texto('POSTGRES_BASE', 'administracion'),
      maxConexiones: entero('POSTGRES_MAX_CONEXIONES', 10),
      esperaMaximaMs: entero('POSTGRES_ESPERA_MAXIMA_MS', 3000),
    },
    rabbitmq: { url: texto('RABBITMQ_URL', 'amqp://hexacore:hexacore@localhost:5672') },
    correo: {
      urlProveedor: texto('CORREO_PROVEEDOR_URL', 'http://localhost:3098'),
      urlBaseEnlaces: texto('CORREO_URL_BASE_ENLACES', 'http://localhost:4200/cuenta'),
    },
    jwt,
    redis: {
      host: texto('REDIS_HOST', 'localhost'),
      // 6380: el puerto en que lo expone App/infra/docker-compose.yml.
      puerto: entero('REDIS_PUERTO', 6380),
    },
    seguridad,
  };
}

/** Clave con la que se inyecta la configuración: `@Inject(CONFIGURACION)`. */
export const CONFIGURACION = 'CONFIGURACION_SERVICIO';
