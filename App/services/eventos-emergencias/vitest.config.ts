import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Este servicio no tiene pruebas unitarias: las 20 que tiene son de
    // integración y viven en `test/`, con base de datos y cola de verdad
    // (`npm run test:e2e`). Sin esto, `npm test` devolvía error por no
    // encontrar ninguna, y cualquier CI que lo corriera daba rojo.
    passWithNoTests: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
