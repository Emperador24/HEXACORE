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
    // Sin *.spec.ts todavía: las 22 pruebas del servicio son de integración
    // (test/*.e2e-spec.ts). Sin este patrón, `npm test` no encontraba nada
    // y salía con código de error — cualquier CI que lo corriera daba rojo.
    include: ['**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
  },
});
