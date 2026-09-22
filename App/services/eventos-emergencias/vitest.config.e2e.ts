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
      // `all` cuenta también los archivos que ninguna prueba llegó a tocar.
      // Sin esto el porcentaje sale inflado: mide solo lo que las pruebas ya
      // visitan, que es justo lo que la rúbrica no quiere.
      all: true,
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: './cobertura-integracion',
      // Bootstrap del proceso (crea el DataSource real y llama app.listen);
      // los tests de integración instancian el módulo directamente vía
      // Test.createTestingModule, así que este archivo nunca se ejecuta.
      //
      // Migraciones y semillas quedan fuera por el mismo criterio que usan
      // Administración y Entradas en sus `cobertura-integracion.sh`: son DDL
      // y datos que se aplican al desplegar (`npm run migracion:correr`), no
      // código de servicio que una petición ejercite. Contarlas hundía el
      // porcentaje midiendo algo que las pruebas no deben ejecutar.
      exclude: [
        'src/main.ts',
        'src/persistencia/migraciones/**',
        'src/persistencia/semillas/**',
      ],
    },
  },
});
