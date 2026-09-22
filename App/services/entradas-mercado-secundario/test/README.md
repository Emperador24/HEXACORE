# E2E reales de CU-001

Requiere Docker y las dependencias Node instaladas (`npm ci` en el servicio).
Desde la raíz del repositorio:

```bash
docker compose -f App/services/entradas-mercado-secundario/test/docker-compose.e2e.yml up -d --build --wait
npm --prefix App/services/entradas-mercado-secundario run test:e2e
docker compose -f App/services/entradas-mercado-secundario/test/docker-compose.e2e.yml down -v
```

La suite usa PostgreSQL 16, Redis 7, RabbitMQ 3.13 y la pasarela simulada
existente, todos reales en Docker. No usa mocks ni reemplaza providers. Nest
levanta `AppModule` en un puerto HTTP efímero, con el mismo `ValidationPipe`
que `main.ts`, y aplica las migraciones registradas.

El Compose independiente `entradas-e2e` usa los puertos locales 15434, 16381,
15674 y 13100, distintos de los de desarrollo y de los de `pedidos-e2e`, para
poder correr ambas suites sin pisarse. `entorno-e2e.ts` fija estos destinos y
la base `entradas_e2e` antes de importar la aplicación, de modo que no se
hereda el `.env` de desarrollo. No ejecutar dos suites contra este Compose a
la vez.

Los JWT de los fixtures se firman con la clave de desarrollo del repositorio;
la verificación RS256 y el rol Cliente son los reales del servicio. No hace
falta Administración ni el Gateway para probar este microservicio.

## Qué se comprueba

- Que las migraciones dejan en pie las 6 tablas de la venta primaria. Esta
  comprobación existe por un motivo concreto: una comilla de más en la
  migración dejó el servicio sin esas tablas y las 336 pruebas unitarias no lo
  vieron, porque corren contra un doble de la base (`test/dobles/base-datos.ts`).
- Flujo básico del CU-001: reservar, aplicar cupón, pagar y recibir un QR por
  entrada, con el descuento repartido cuadrando con el total cobrado.
- Que el hecho `COMPRA_CONFIRMADA` se publica en `ventas.eventos` y llega al
  broker.
- CU-001A (sin disponibilidad), CU-001C (pago rechazado y reintento con otra
  tarjeta) y el rechazo de un cuerpo con campos de más.
- Que pagar dos veces la misma compra no emite entradas de más.
- Que el aforo resiste reservas simultáneas: con más peticiones que cupos,
  solo pasan las que caben y `vendidas + reservadas` nunca supera el aforo.

## Convenciones

Los fixtures usan UUID únicos y un código de cupón con marca de tiempo, así que
las corridas no se ven entre sí y la suite se puede repetir tal cual.

El teardown **no borra datos**, solo cierra los clientes. Emitir una entrada
escribe en `historial_propietarios`, y un disparador de la migración inicial la
hace inmutable (auditoría CU-006 / RNF-11): borrar la entrada obligaría a borrar
antes su historial, que es justo lo que esa regla prohíbe. Una prueba no debe
desactivar la garantía que el sistema promete, y no hace falta — `entradas_e2e`
es una base desechable y `docker compose down -v` la elimina entera.

RabbitMQ se observa con una cola exclusiva: nunca se consumen ni se purgan
mensajes de la cola real del servicio.

`npm test` mantiene exclusivamente las pruebas unitarias bajo `src`.
