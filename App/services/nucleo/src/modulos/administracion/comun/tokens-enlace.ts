import { createHash, randomBytes } from 'node:crypto';

/**
 * Bytes de entropía del token que viaja en el enlace.
 *
 * 32 bytes son 256 bits. Un enlace de recuperación **da acceso a la cuenta**,
 * así que adivinarlo tiene que ser imposible en la práctica; con este tamaño,
 * probar al azar no llega a ninguna parte ni con todos los intentos del mundo.
 */
const BYTES_TOKEN = 32;

/**
 * Los enlaces de un solo uso que se envían por correo (CU-027 paso 5 y CU-027A).
 *
 * ## La regla que sostiene todo esto
 *
 * **El token viaja en el correo; en la base solo queda su hash.**
 *
 * Es la misma lógica que con las contraseñas y por el mismo motivo: un enlace
 * de recuperación es una credencial viva. Si se guardara en claro, cualquiera
 * con acceso de lectura a la base podría tomar los enlaces pendientes y entrar
 * en esas cuentas — sin forzar nada y sin dejar rastro de intrusión.
 *
 * Guardando solo el hash, la base no sirve para suplantar a nadie: el valor
 * útil existe una sola vez, en el correo de su destinatario.
 *
 * ## Por qué aquí basta SHA-256 y en las contraseñas no
 *
 * Parece una contradicción —SHA-256 es justo lo que se descartó para las
 * contraseñas— pero la diferencia es la entropía de lo que se protege. Una
 * contraseña la elige una persona y es adivinable, así que hay que encarecer
 * cada intento con `scrypt`. Un token de 256 bits aleatorios no se adivina por
 * fuerza bruta, de modo que un hash rápido es suficiente y evita gastar 100 ms
 * en cada comprobación de enlace.
 */

export interface EnlaceGenerado {
  /** El valor que viaja en el correo. **No se guarda en ninguna parte.** */
  token: string;
  /** Lo único que se persiste. */
  hash: string;
  expiraEn: Date;
}

/** Genera un token nuevo y su hash, con la caducidad indicada. */
export function generarEnlace(minutosDeVida: number): EnlaceGenerado {
  // `base64url` en vez de `hex`: cabe en una URL sin escapar nada y es más
  // corto, lo que importa porque algunos clientes de correo parten los enlaces
  // largos en varias líneas y los dejan inservibles.
  const token = randomBytes(BYTES_TOKEN).toString('base64url');
  return {
    token,
    hash: hashDeToken(token),
    expiraEn: new Date(Date.now() + minutosDeVida * 60_000),
  };
}

/**
 * Hash del token, en hexadecimal.
 *
 * Son siempre 64 caracteres, que es lo que exige la restricción
 * `ck_tokens_hash_es_sha256` de la base: si alguna vez se intentara guardar un
 * token en claro, la inserción fallaría en vez de pasar inadvertida.
 */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
