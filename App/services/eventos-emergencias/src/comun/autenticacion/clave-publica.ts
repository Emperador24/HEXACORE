import { createHash, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Carga de la clave **pública** con la que se verifican los tokens de sesión.
 *
 * Este servicio verifica, no emite: la clave privada la tiene únicamente el
 * Servicio de Administración (ADR-11). Con la pública se comprueba que un token
 * lo firmó él, y no se puede fabricar ninguno.
 *
 * El contrato está en `App/shared/seguridad/token-sesion.md`.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const CLAVE_DESARROLLO = resolve(AQUI, '../../../../../infra/claves-desarrollo/jwt-publica.pem');

/**
 * Huella de la clave de desarrollo, escrita aquí a propósito.
 *
 * Va en el código y no se calcula del archivo: así la comprobación funciona
 * aunque el archivo no exista en la máquina de producción, que es justo donde
 * importa que no se use.
 */
export const HUELLA_CLAVE_DESARROLLO =
  'f696ee0f606b5a5f16ba37f8f0628b0f7c94dd08e6ba34de463f33dfe6266f5d';

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

  const huella = createHash('sha256')
    .update(clave.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  const deDesarrollo = huella === HUELLA_CLAVE_DESARROLLO;

  if (produccion && deDesarrollo) {
    throw new Error(
      'La clave pública configurada es la de desarrollo del repositorio. ' +
        'Genera un par propio antes de desplegar (ver App/infra/claves-desarrollo/README.md).',
    );
  }

  return { pem, deDesarrollo };
}
