import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Clave pública con la que este servicio verifica los tokens de sesión.
 *
 * Los firma el Servicio de Administración con su clave privada (RS256). Aquí
 * solo llega la pública, que **sirve para verificar y no para firmar**: si este
 * servicio se viera comprometido, no podría usarse para fabricar tokens. Ver
 * `App/shared/seguridad/token-sesion.md`.
 */

/** `dist/comun/autenticacion/` y `src/comun/autenticacion/` están a la misma profundidad. */
const CLAVE_DESARROLLO = resolve(__dirname, '../../../../../infra/claves-desarrollo/jwt-publica.pem');

/**
 * Huella de la clave pública de desarrollo, escrita aquí para poder rechazarla
 * en producción aunque el archivo no exista. Es la misma constante que en el
 * Servicio de Administración.
 */
export const HUELLA_CLAVE_DESARROLLO = 'f696ee0f606b5a5f16ba37f8f0628b0f7c94dd08e6ba34de463f33dfe6266f5d';

export interface ClavePublica {
  pem: string;
  deDesarrollo: boolean;
}

export function cargarClavePublica(produccion: boolean): ClavePublica {
  const ruta = process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO?.trim();
  if (produccion && !ruta) {
    throw new Error('En producción AUTH_JWT_CLAVE_PUBLICA_ARCHIVO es obligatoria');
  }

  const origen = ruta || CLAVE_DESARROLLO;
  let pem: string;
  try {
    pem = readFileSync(origen, 'utf8');
  } catch (error) {
    throw new Error(`No se pudo leer la clave pública JWT (${origen}): ${(error as Error).message}`);
  }

  let clave;
  try {
    clave = createPublicKey(pem);
  } catch (error) {
    throw new Error(`La clave pública JWT no es un PEM válido: ${(error as Error).message}`);
  }
  if (clave.asymmetricKeyType !== 'rsa') {
    throw new Error('La clave pública JWT debe ser RSA (el algoritmo es RS256)');
  }

  const huella = createHash('sha256').update(clave.export({ type: 'spki', format: 'der' })).digest('hex');
  const deDesarrollo = huella === HUELLA_CLAVE_DESARROLLO;
  // La privada de desarrollo está en el repositorio: aceptar tokens firmados
  // con ella en producción sería aceptar tokens fabricados por cualquiera.
  if (produccion && deDesarrollo) {
    throw new Error('Se está usando la clave pública JWT de desarrollo en producción');
  }
  return { pem, deDesarrollo };
}
