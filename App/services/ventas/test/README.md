# CU-001 real aislado

La prueba conserva sus ocho casos y aserciones; arranca los procesos compilados,
usa Pagos real y pasarela simulada. Comparte la infraestructura exclusiva de
[la referencia de Boletería](../../../backend/test/boleteria/README.md).
Desde raíz, con Node 22.22.3:

```bash
npm --prefix App/backend run test:boleteria:infra
npm --prefix App/services/ventas run test:e2e
```

No ejecutar iniciar.sh ni las semillas de desarrollo. La prueba usa UUID nuevos;
el historial de propietarios y el libro de Pagos se conservan hasta limpiar solo
el proyecto hexacore-boleteria-e2e. No prueba login ni interfaces.
