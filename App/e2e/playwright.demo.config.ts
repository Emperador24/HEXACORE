import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import normal from './playwright.config';

// Solo se activa con el comando demo; la configuración normal no importa este archivo.
if (process.env.CI) throw new Error('El modo demo es local. En CI utiliza test:implementados o test:completo.');

const entornoLocal = resolve(__dirname, '.env.local');
if (existsSync(entornoLocal)) loadEnvFile(entornoLocal);

const valor = process.env.CU015_DEMO_MS ?? '800';
const demora = Number(valor);
if (!/^\d+$/.test(valor) || !Number.isSafeInteger(demora)) {
  throw new Error('CU015_DEMO_MS debe ser un entero mayor o igual a cero, expresado en milisegundos.');
}

const valorPausa = process.env.CU015_DEMO_PAUSA_MS ?? '5000';
const pausa = Number(valorPausa);
if (!/^\d+$/.test(valorPausa) || !Number.isSafeInteger(pausa)) {
  throw new Error('CU015_DEMO_PAUSA_MS debe ser un entero mayor o igual a cero.');
}
// Cada worker vuelve a leer esta configuración: conservar una carpeta por ejecución.
const sello = process.env.CU015_DEMO_SESION ?? new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[\dTZ-]+$/.test(sello)) throw new Error('Identificador de sesión demo inválido.');
process.env.CU015_DEMO_SESION = sello;
const salida = resolve(__dirname, '.evidencia', `demo-${sello}`);
if (process.env.TEST_WORKER_INDEX === undefined) {
  console.log(`DEMO VISUAL — slowMo ${demora} ms; etapas ${pausa} ms. No sustituye la aceptación automática. Informe privado: ${salida}`);
}

export default defineConfig({
  ...normal,
  // Presupuesto de presentación; normal/CI conservan su límite total de 120 s.
  timeout: 15 * 60_000,
  outputDir: resolve(salida, 'resultados'),
  reporter: [['list'], ['html', { outputFolder: resolve(salida, 'informe'), open: 'never' }]],
  metadata: { ...normal.metadata, modo: 'DEMO visual (no aceptación)', demo: true, slowMoMs: demora, pausaMs: pausa },
  use: {
    ...normal.use,
    headless: false,
    trace: 'on',
    // Una acción sin respuesta no debe consumir los quince minutos de presentación.
    actionTimeout: normal.timeout,
    navigationTimeout: normal.timeout,
    launchOptions: { ...normal.use?.launchOptions, slowMo: demora },
  },
});
