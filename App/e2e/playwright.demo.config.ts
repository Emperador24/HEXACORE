import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import normal from './playwright.config';

// demo y los comandos :visible; aceptación normal y CI no importan este archivo.
if (process.env.CI) throw new Error('El modo demo es local. En CI utiliza test:implementados o test:completo.');

const entornoLocal = resolve(__dirname, '.env.local');
if (existsSync(entornoLocal)) loadEnvFile(entornoLocal);

// Velocidad definida aquí, también si .env.local conserva variables antiguas.
const demora = 1000;
const pausa = 2500;
// Cada worker vuelve a leer esta configuración: conservar una carpeta por ejecución.
const sello = process.env.CU015_DEMO_SESION ?? new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[\dTZ-]+$/.test(sello)) throw new Error('Identificador de sesión demo inválido.');
process.env.CU015_DEMO_SESION = sello;
const salida = resolve(__dirname, '.evidencia', `demo-${sello}`);
if (process.env.TEST_WORKER_INDEX === undefined) {
  console.log(`DEMO VISUAL — ${demora} ms entre operaciones de interfaz; ${pausa} ms de lectura por pantalla/etapa lista. No sustituye la aceptación automática. Informe privado: ${salida}`);
}

export default defineConfig({
  ...normal,
  // Presupuesto de presentación; normal/CI conservan su límite total de 120 s.
  timeout: 15 * 60_000,
  outputDir: resolve(salida, 'resultados'),
  reporter: [['list'], ['html', { outputFolder: resolve(salida, 'informe'), open: 'never' }]],
  metadata: { ...normal.metadata, modo: 'DEMO visual (no aceptación)', demo: true, accionMs: demora, slowMoMs: 0, pausaMs: pausa },
  use: {
    ...normal.use,
    headless: false,
    trace: 'on',
    // Una acción sin respuesta no debe consumir los quince minutos de presentación.
    actionTimeout: normal.timeout,
    navigationTimeout: normal.timeout,
    // actuar() aplica la demora entre acciones y enfoca al actor antes de actuar.
    // slowMo nativo añadiría otra demora a bringToFront y a las comprobaciones.
    launchOptions: { ...normal.use?.launchOptions, slowMo: 0 },
  },
});
