import { defineConfig } from '@playwright/test';

/**
 * Demostración de los casos de uso de Samuel en los portales reales.
 *
 * - `npm run demo`: corre todo sin ventana y graba un video por caso de uso.
 * - `npm run demo:ver`: abre Chrome y va despacio, para presentarlo en vivo.
 *
 * Las direcciones y las cuentas salen de `apoyo/entorno.ts` (variables de
 * entorno); por defecto, el entorno local habitual con los datos de demo.
 */
const lento = Number(process.env.DEMO_LENTO ?? 0);

export default defineConfig({
  testDir: './casos',
  globalSetup: './apoyo/preparar.ts',
  // Los casos comparten el evento de demostración: uno detrás de otro, en orden.
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'informe', open: 'never' }]],
  outputDir: 'resultados',
  use: {
    channel: 'chrome',
    headless: !process.env.DEMO_VISIBLE,
    viewport: { width: 1440, height: 900 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    screenshot: 'on',
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
    launchOptions: { slowMo: lento },
  },
});
