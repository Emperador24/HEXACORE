import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Solo unitarias. Las 34 pruebas del servicio son de **integración** y
    // viven en `test/*.e2e-spec.ts`: necesitan PostgreSQL y RabbitMQ de
    // verdad, y se corren con `npm run test:e2e`. Meterlas aquí hacía que
    // `npm test` intentara conectarse a una base que en el CI no existe.
    include: ['**/*.spec.ts'],
    // Todavía no hay unitarias. Sin esto, `npm test` salía con código de
    // error por no encontrar ninguna y el pipeline daba rojo por una
    // ausencia conocida.
    passWithNoTests: true,
  },
});
