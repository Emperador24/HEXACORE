import { defineConfig } from '@playwright/test';
import normal from './playwright.config';
import { resolve } from 'node:path';

if (!process.env.SEGURIDAD_SALIDA || !process.env.HEXACORE_COMPROBAR_CSP) {
  throw new Error('Define SEGURIDAD_SALIDA privada y HEXACORE_COMPROBAR_CSP=1');
}
const salida = resolve(process.env.SEGURIDAD_SALIDA, process.env.CSP_EJECUCION || 'negocio');
// Se conserva íntegramente la configuración normal; solo cambia dónde guardar evidencia.
export default defineConfig(normal, {
  outputDir: resolve(salida, 'resultados'),
  reporter: [['list'], ['json', { outputFile: resolve(salida, 'resultado.json') }],
    ['html', { outputFolder: resolve(salida, 'informe'), open: 'never' }]],
});
