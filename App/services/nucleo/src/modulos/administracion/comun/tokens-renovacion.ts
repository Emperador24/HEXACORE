import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de renovación de sesión (DECISIONES.md §21).
 *
 * ## Formato
 *
 * `base64url( id de sesión (16 bytes) · generación (4 bytes) · HMAC-SHA256 (32 bytes) )`
 *
 * El HMAC, con una clave que solo tiene este servicio, cubre el id y la
 * generación: nadie puede fabricar un token ni cambiarle la generación.
 *
 * ## Por qué así y no un valor aleatorio guardado en la base
 *
 * La rotación exige detectar cuándo alguien usa un token **ya gastado** (señal
 * de robo). Con tokens aleatorios eso obliga a guardar el hash de cada token
 * emitido; con un token de acceso de 15 minutos y sesiones sin tope, serían
 * miles de filas por sesión activa.
 *
 * Aquí basta un número por sesión: la generación actual. Un token auténtico
 * (su HMAC cuadra) con una generación anterior a la actual es, por
 * construcción, uno ya gastado. Y como el HMAC hay que acertarlo, nadie puede
 * cerrar la sesión de otra persona mandando tokens inventados.
 */

const BYTES_ID = 16;
const BYTES_GENERACION = 4;
const BYTES_MAC = 32;
const LARGO = BYTES_ID + BYTES_GENERACION + BYTES_MAC;

export interface TokenRenovacionLeido {
  sesionId: string;
  generacion: number;
}

function uuidABytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesAUuid(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function mac(clave: Buffer, cuerpo: Buffer): Buffer {
  return createHmac('sha256', clave).update('hexacore:renovacion:v1:').update(cuerpo).digest();
}

export function emitirTokenRenovacion(sesionId: string, generacion: number, clave: Buffer): string {
  if (!Number.isInteger(generacion) || generacion < 0 || generacion > 0xffffffff) {
    throw new Error(`Generación fuera de rango: ${generacion}`);
  }
  const id = uuidABytes(sesionId);
  if (id.length !== BYTES_ID) throw new Error(`Id de sesión no válido: ${sesionId}`);
  const gen = Buffer.alloc(BYTES_GENERACION);
  gen.writeUInt32BE(generacion);
  const cuerpo = Buffer.concat([id, gen]);
  return Buffer.concat([cuerpo, mac(clave, cuerpo)]).toString('base64url');
}

/** Devuelve el contenido si el token es auténtico, o `null`. Nunca lanza. */
export function leerTokenRenovacion(token: unknown, clave: Buffer): TokenRenovacionLeido | null {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{70}$/.test(token)) return null;
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== LARGO) return null;

  const cuerpo = bytes.subarray(0, BYTES_ID + BYTES_GENERACION);
  const recibido = bytes.subarray(BYTES_ID + BYTES_GENERACION);
  // Comparación en tiempo constante: una normal permitiría adivinar el HMAC
  // byte a byte midiendo cuánto tarda en fallar.
  if (!timingSafeEqual(recibido, mac(clave, cuerpo))) return null;

  return {
    sesionId: bytesAUuid(bytes.subarray(0, BYTES_ID)),
    generacion: bytes.readUInt32BE(BYTES_ID),
  };
}
