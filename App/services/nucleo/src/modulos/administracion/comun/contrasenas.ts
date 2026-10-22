import { BinaryLike, randomBytes, ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify` no conserva la sobrecarga de `scrypt` que acepta opciones, así
 * que se declara el tipo a mano. Sin esto, TypeScript solo ve la variante de
 * tres argumentos y no deja pasar los parámetros de coste.
 */
const scryptAsync = promisify(scrypt) as (
  contrasena: BinaryLike,
  salt: BinaryLike,
  largo: number,
  opciones: ScryptOptions,
) => Promise<Buffer>;

/**
 * Parámetros de `scrypt`.
 *
 * `N = 2^15` (32768) es el coste de CPU y memoria: cada cálculo ocupa unos
 * 32 MB y tarda del orden de 100 ms. Ese coste es el punto — hace que probar
 * contraseñas a gran escala salga caro, que es justo lo que se busca. Subirlo
 * mejora la resistencia pero ralentiza cada login, y el CU-027 pide que el
 * login *"responda incluso en horas pico"*.
 */
const COSTE_N = 2 ** 15;
const TAMANO_BLOQUE_R = 8;
const PARALELIZACION_P = 1;
const LARGO_CLAVE = 64;
const LARGO_SALT = 16;

/** Identifica el algoritmo dentro del hash, para poder cambiarlo más adelante. */
const ETIQUETA = 'scrypt';

/**
 * Cifrado de contraseñas (CU-027 paso 4: *"cifra la contraseña"*).
 *
 * ## Por qué `scrypt` y no bcrypt ni un hash simple
 *
 * Un hash rápido (SHA-256, MD5) es lo peor que se puede usar aquí: una tarjeta
 * gráfica prueba miles de millones por segundo. `scrypt` está diseñado para ser
 * lento **y** consumir memoria, lo que anula la ventaja de GPU y ASIC — por eso
 * se le llama *memory-hard*.
 *
 * Frente a Argon2id, que es el recomendado hoy por OWASP: `scrypt` viene en la
 * librería estándar de Node y no exige compilar nada al instalar. Con cuatro
 * personas instalando el proyecto en cuatro máquinas, eso pesa. Ver
 * DECISIONES.md §1.
 *
 * ## El salt
 *
 * Aleatorio y distinto para cada contraseña. Sin él, dos personas con la misma
 * contraseña tendrían el mismo hash —y romper uno sería romper los dos—, y
 * serviría una tabla precalculada. Se guarda junto al hash porque no es
 * secreto: su función es que cada hash sea único, no ocultar nada.
 *
 * ## Formato guardado
 *
 * `scrypt$N$r$p$<salt en base64>$<hash en base64>`
 *
 * Los parámetros van dentro a propósito: si mañana se sube el coste, las
 * contraseñas antiguas se siguen verificando con los suyos y se pueden migrar
 * poco a poco, sin invalidar a nadie.
 */
export async function cifrarContrasena(contrasena: string): Promise<string> {
  const salt = randomBytes(LARGO_SALT);
  const derivada = await scryptAsync(contrasena.normalize('NFKC'), salt, LARGO_CLAVE, {
    N: COSTE_N,
    r: TAMANO_BLOQUE_R,
    p: PARALELIZACION_P,
    // Node limita la memoria de scrypt por defecto y `N = 2^15` la supera.
    maxmem: 64 * 1024 * 1024,
  });

  return [
    ETIQUETA,
    COSTE_N,
    TAMANO_BLOQUE_R,
    PARALELIZACION_P,
    salt.toString('base64'),
    derivada.toString('base64'),
  ].join('$');
}

/**
 * Comprueba una contraseña contra su hash.
 *
 * Usa `timingSafeEqual`, que tarda lo mismo acierte o falle. Una comparación
 * normal (`===`) se detiene en el primer byte distinto, y medir esa diferencia
 * permite ir adivinando el hash byte a byte. Es un ataque real, no teórico.
 *
 * Nunca lanza: una contraseña que no coincide y un hash corrupto son ambos
 * "no válida". Propagar el error distinguiría ambos casos y filtraría
 * información sobre el estado de la cuenta.
 */
export async function verificarContrasena(contrasena: string, almacenado: string): Promise<boolean> {
  try {
    const [etiqueta, n, r, p, saltB64, hashB64] = almacenado.split('$');
    if (etiqueta !== ETIQUETA) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const esperado = Buffer.from(hashB64, 'base64');

    const derivada = await scryptAsync(contrasena.normalize('NFKC'), salt, esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });

    return timingSafeEqual(derivada, esperado);
  } catch {
    return false;
  }
}

/**
 * Comprueba la fortaleza de una contraseña (CU-027 paso 2).
 *
 * Solo exige longitud, y no mayúsculas ni símbolos: las reglas de composición
 * empujan hacia `Password1!`, que las cumple todas y es de lo primero que
 * prueba un atacante. El NIST desaconseja exigirlas. Ver DECISIONES.md §2.
 *
 * Lo que sí se rechaza es el espacio en blanco puro y las contraseñas de la
 * lista corta de las más usadas: la longitud no salva a `contraseña123` si es
 * lo bastante larga.
 */
const DEMASIADO_COMUNES = new Set([
  'contrasena',
  'contrasena123',
  'password',
  'password123',
  '1234567890',
  '12345678901',
  'qwertyuiop',
  'administrador',
]);

/**
 * Tope de longitud.
 *
 * No es un capricho: cifrar con scrypt una cadena enorme consume memoria y
 * tiempo, así que sin límite bastaría con enviar contraseñas de megabytes para
 * saturar el servicio.
 */
export const LARGO_MAXIMO_CONTRASENA = 200;

export function problemaDeContrasena(contrasena: unknown, longitudMinima: number): string | null {
  // No se confía en que el DTO haya validado: este módulo también lo usan la
  // semilla y el restablecimiento de contraseña, que no pasan por él.
  if (typeof contrasena !== 'string' || contrasena.trim().length === 0) {
    return 'La contraseña no puede estar vacía';
  }
  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) {
    return `La contraseña no puede superar los ${LARGO_MAXIMO_CONTRASENA} caracteres`;
  }
  if (contrasena.length < longitudMinima) {
    return `La contraseña debe tener al menos ${longitudMinima} caracteres`;
  }
  // Se compara sin tildes ni mayúsculas: "Contraseña123" es tan mala como
  // "contrasena123".
  const normalizada = contrasena
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (DEMASIADO_COMUNES.has(normalizada)) {
    return 'Esa contraseña es demasiado común; elige otra';
  }
  return null;
}
