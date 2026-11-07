import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: /cu01[235]\/.*\.spec\.ts$/, workers: 1, fullyParallel: false, forbidOnly: true, retries: 0,
  timeout: 120_000, expect: { timeout: 15_000 },
  outputDir: '.evidencia/resultados',
  reporter: [['list'], ['html', { outputFolder: '.evidencia/informe', open: 'never' }]],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: { args: ['--host-resolver-rules=MAP cu015.localhost 127.0.0.1'] } },
});
