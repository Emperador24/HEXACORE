# E2E reales de CU-011

Requiere Docker y las dependencias Node instaladas (`npm ci` en el servicio).
Desde la raíz del repositorio:

```bash
docker compose -f App/services/pedidos/test/docker-compose.e2e.yml up -d --build --wait
npm --prefix App/services/pedidos run test:e2e
docker compose -f App/services/pedidos/test/docker-compose.e2e.yml down -v
```

La suite usa PostgreSQL 16, Redis 7, RabbitMQ 3.13 y la pasarela simulada
existente, todos reales en Docker. No usa mocks ni reemplaza providers.
Nest levanta AppModule en un puerto HTTP efímero. Aplica las migraciones
registradas y prepara Redis mediante PreparacionInventarioService.

El Compose independiente `pedidos-e2e` usa puertos locales 15433, 16380,
15673 y 13099. `entorno-e2e.ts` fija estos destinos y la base `pedidos_e2e`
antes de importar la aplicación, evitando heredar el `.env` de desarrollo.
No ejecutar simultáneamente dos suites contra este mismo Compose.

Los JWT de fixtures se firman con la clave de desarrollo del repositorio;
la verificación RS256, el rol Cliente y la consulta de revocación Redis son
los reales del servicio. No se necesita Administración ni Gateway para
esta prueba del microservicio.

Se comprueban checkout multi-producto, reserva Lua, expiración registrada,
rollback por insuficiencia de stock Redis, pago rechazado, aprobación HTTP
en la pasarela, confirmación/QR, descuento PostgreSQL, consumo Redis,
mensaje PEDIDO_CONFIRMADO y replay sin segundo descuento/publicación.
RabbitMQ se observa con una cola exclusiva: nunca se consumen ni purgan
mensajes de la cola de establecimientos. Esa cola durable del entorno E2E
puede conservar los mensajes publicados hasta eliminar los contenedores.

Los fixtures usan UUID únicos. El teardown elimina solo sus registros y
claves y cierra los clientes; no trunca tablas ni ejecuta FLUSHDB. Las
migraciones quedan aplicadas, de modo que se puede repetir la suite.
`npm test` mantiene exclusivamente las pruebas unitarias bajo `src`.
