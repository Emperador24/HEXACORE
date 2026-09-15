import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Los specs e2e sincronizan el esquema (synchronize:true) contra la
    // misma base compartida al arrancar; correr los archivos en paralelo
    // produce carreras al crear los tipos enum (pg_type_typname_nsp_index).
    fileParallelism: false,
    coverage: {
      include: ['src/**'],
      // Bootstrap del proceso (crea el DataSource real y llama app.listen);
      // los tests de integración instancian el módulo directamente vía
      // Test.createTestingModule, así que este archivo nunca se ejecuta.
      exclude: ['src/main.ts'],
    },
  },
});
