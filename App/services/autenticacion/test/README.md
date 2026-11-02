# Pruebas de Autenticación

Las pruebas unitarias propias permanecen en `src/**/*.spec.ts` y se ejecutan
con `npm test -- --runInBand`. `test/dobles/nestjs-typeorm.ts` es el doble que
usa esa configuración; se conserva sin cambios.

Las suites HTTP de CU-027 permanecen en `pruebas/` y conservan su comando
`npm run test:integracion`. Requieren un ambiente controlado: algunas preparan
datos y provocan fallos de infraestructura. No las ejecuta la suite de Alimentos.

La configuración E2E de **CU-011** que estaba aquí pertenecía a Alimentos.
Su Compose, entorno, configuración de Jest e instrucciones están ahora en
[`../../alimentos/test/README.md`](../../alimentos/test/README.md).
Se retiró el script `test:e2e` de este paquete porque no había specs propios
para él. Esto no crea una suite E2E de login ni declara cobertura de ese flujo.
