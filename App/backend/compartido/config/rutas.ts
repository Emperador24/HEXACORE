import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Funciona desde fuentes y dist; las claves montadas explícitamente prevalecen. */
export function clavesDesarrollo(): string {
  let directorio = __dirname;
  while (dirname(directorio) !== directorio) {
    if (existsSync(resolve(directorio, 'package.json')) && (existsSync(resolve(directorio, 'apps/nucleo')) || existsSync(resolve(directorio, 'dist/apps/nucleo')))) {
      return resolve(directorio, '../infra/claves-desarrollo');
    }
    directorio = dirname(directorio);
  }
  throw new Error('No se encontró el workspace backend; configura las rutas AUTH_JWT_CLAVE_*_ARCHIVO');
}
