import { createHash, createPrivateKey, createPublicKey, hkdfSync, KeyObject, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga y comprobación de las claves con que se firman los tokens de sesión.
 *
 * RS256 y no HS256: la clave privada solo la tiene este servicio; los demás
 * reciben la pública, que **solo sirve para verificar**. Con un secreto
 * compartido, cualquier microservicio que verifique tokens podría también
 * fabricarlos. Ver DECISIONES.md §7.
 */

/**
 * Las claves de desarrollo, que están en el repositorio.
 *
 * La ruta se resuelve desde este archivo y no desde el directorio de trabajo,
 * para que funcione igual con `node dist/main.js`, con `start:dev` y con Jest
 * (`dist/config/` y `src/config/` están a la misma profundidad).
 */
const CLAVES_DESARROLLO = resolve(__dirname, '../../../../infra/claves-desarrollo');

/**
 * Huella SHA-256 de la clave pública de desarrollo.
 *
 * Va escrita aquí, y no se calcula leyendo el archivo, porque en producción ese
 * archivo no tiene por qué existir: la comprobación tiene que funcionar sin él.
 */
export const HUELLA_CLAVE_DESARROLLO = 'f696ee0f606b5a5f16ba37f8f0628b0f7c94dd08e6ba34de463f33dfe6266f5d';

export interface ClavesJwt {
  clavePrivada: string;
  clavePublica: string;
  /** Si son las del repositorio. En producción está prohibido. */
  deDesarrollo: boolean;
  /**
   * Clave HMAC con la que se firman los tokens de renovación.
   *
   * Se **deriva** de la privada (HKDF) en vez de ser un secreto aparte: tiene
   * exactamente la misma frontera de confianza —solo este servicio la conoce— y
   * así no hay una segunda credencial que configurar, rotar y proteger. Rotar
   * la clave privada invalida también las sesiones abiertas, que es lo que se
   * quiere si se rota por una filtración. Ver DECISIONES.md §21.
   */
  claveRenovacion: Buffer;
}

function leer(ruta: string, variable: string): string {
  try {
    return readFileSync(ruta, 'utf8');
  } catch (error) {
    throw new Error(`No se pudo leer ${variable} (${ruta}): ${(error as Error).message}`);
  }
}

export function huella(clave: KeyObject): string {
  return createHash('sha256').update(clave.export({ type: 'spki', format: 'der' })).digest('hex');
}

export function cargarClavesJwt(produccion: boolean): ClavesJwt {
  const rutaPrivada = process.env.AUTH_JWT_CLAVE_PRIVADA_ARCHIVO?.trim();
  const rutaPublica = process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO?.trim();

  if (produccion && (!rutaPrivada || !rutaPublica)) {
    throw new Error(
      'En producción AUTH_JWT_CLAVE_PRIVADA_ARCHIVO y AUTH_JWT_CLAVE_PUBLICA_ARCHIVO son obligatorias ' +
        '(ver infra/claves-desarrollo/README.md)',
    );
  }

  const pemPrivada = leer(
    rutaPrivada || resolve(CLAVES_DESARROLLO, 'jwt-privada.pem'),
    'AUTH_JWT_CLAVE_PRIVADA_ARCHIVO',
  );
  const pemPublica = leer(
    rutaPublica || resolve(CLAVES_DESARROLLO, 'jwt-publica.pem'),
    'AUTH_JWT_CLAVE_PUBLICA_ARCHIVO',
  );

  let privada: KeyObject;
  let publica: KeyObject;
  try {
    privada = createPrivateKey(pemPrivada);
    publica = createPublicKey(pemPublica);
  } catch (error) {
    throw new Error(`Las claves JWT no son PEM válidos: ${(error as Error).message}`);
  }

  if (privada.asymmetricKeyType !== 'rsa' || publica.asymmetricKeyType !== 'rsa') {
    throw new Error('Las claves JWT deben ser RSA (el algoritmo es RS256)');
  }
  // Por debajo de 2048 bits, RSA ya no se considera seguro (NIST SP 800-131A).
  const bits = publica.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < 2048) {
    throw new Error(`La clave JWT tiene ${bits} bits; el mínimo es 2048`);
  }

  // Que la pública corresponda a la privada. Si no, este servicio emitiría
  // tokens que ningún otro podría verificar, y el fallo aparecería lejos de
  // aquí, como un 401 inexplicable en otro microservicio.
  const prueba = Buffer.from('comprobacion-de-pareja');
  if (!verify('sha256', prueba, publica, sign('sha256', prueba, privada))) {
    throw new Error('AUTH_JWT_CLAVE_PUBLICA_ARCHIVO no corresponde a AUTH_JWT_CLAVE_PRIVADA_ARCHIVO');
  }

  const deDesarrollo = huella(publica) === HUELLA_CLAVE_DESARROLLO;
  // Arrancar en producción con una clave que está en el repositorio sería peor
  // que no tener autenticación: aparentaría tenerla.
  if (produccion && deDesarrollo) {
    throw new Error('Se están usando las claves JWT de desarrollo en producción: genera unas propias');
  }

  const claveRenovacion = Buffer.from(
    hkdfSync('sha256', privada.export({ type: 'pkcs8', format: 'der' }), 'hexacore', 'token-de-renovacion-v1', 32),
  );

  return { clavePrivada: pemPrivada, clavePublica: pemPublica, deDesarrollo, claveRenovacion };
}
