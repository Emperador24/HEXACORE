# Integración aislada de CU-011

Recorre **Alimentos → servidor Pagos real → pasarela HTTP simulada**, con
PostgreSQL 16, Redis 7 y RabbitMQ 3.13 reales. La suite compila y arranca el
`main.js` real de Alimentos en un proceso Node 22 propio, puerto 13087, con su
AppModule y ValidationPipe. No se reemplazan providers ni se carga el mapper
de dobles de las unitarias. El proceso termina con SIGTERM al cerrar la suite.

Jest 30 en Node 22 no puede requerir directamente el adaptador ESM
`@nestjs/typeorm` desde las pruebas CommonJS. Arrancar el código compilado en
Node permite cargar sus dependencias reales sin cambiar versiones ni
introducir un doble de persistencia en esta integración.

Son **cinco pruebas**, ejecutadas en orden sobre fixtures propios:

1. Checkout de dos productos: reserva Lua y registro PostgreSQL sin descuento.
2. Inventario insuficiente: rechazo y rollback de los registros del checkout.
3. Pago rechazado: conserva reserva y stock, sin evento; libro real de Pagos.
4. Pago aprobado: referencia de pasarela, libro de Pagos, confirmación, QR,
   descuento SQL, consumo Redis y `PEDIDO_CONFIRMADO` observado en RabbitMQ.
5. Replay: misma respuesta/QR, sin otro descuento, evento ni intento financiero;
   una clave nueva para el pedido pagado se rechaza.

Los JWT son fixtures firmados con las claves RSA exclusivas de `test/claves/`.
Su privada es un dato público de prueba; Pagos solo monta la pública. Se usan
verificación RS256 y revocación Redis reales. **No prueba login, gateway,
interfaces, proveedor bancario real ni resolución de pagos inciertos (F12).**
La pasarela envía callbacks firmados al Pagos de esta red; no hay gateway.
Esta suite caracteriza la confirmación síncrona, no la recuperación por callback.

## Node y dependencias

Node **22.22.3**, fijado en `../.nvmrc`; imagen de Pagos y simulador
`node:22.22.3-alpine`. Los paquetes mantienen sus lockfiles actuales.
Con nvm: `cd App/services/alimentos && nvm use` (instalar esa versión si falta).

Alternativa sin modificar el Node global, usada en esta revisión:

```bash
npm install --prefix /private/tmp/hexacore-cu011-node22 node@22.22.3 --no-save --no-package-lock
export PATH="/private/tmp/hexacore-cu011-node22/node_modules/.bin:$PATH"
node --version                         # v22.22.3
npm --prefix App/services/alimentos ci
```

Desde la raíz de HEXACORE, con Docker Desktop disponible:

```bash
npm --prefix App/services/alimentos run test:e2e:infra
npm --prefix App/services/alimentos run test:e2e
npm --prefix App/services/alimentos run test:e2e    # repetir sin reiniciar ni vaciar
```

El primer build instala el lockfile de Pagos, compila su código actual y aplica
solo sus migraciones en `pagos_cu011_e2e` antes de arrancarlo. El bootstrap de
la suite aplica las migraciones de Alimentos en su base y prepara únicamente
su establecimiento con el comando real `preparar-inventario.js`, que usa
`PreparacionInventarioService`. No ejecuta `iniciar.sh`,
semillas ni sincronización automática de esquema. Si falta infraestructura o
falla el arranque, la suite falla; no usa `skip`, `passWithNoTests` ni fallback
a servicios de desarrollo.

## Aislamiento y recursos

Los scripts fijan explícitamente `-p hexacore-cu011-e2e`. Red, contenedores,
imágenes de build y volúmenes son de ese proyecto; no hay `container_name`,
volúmenes externos ni mounts de datos de desarrollo. Los puertos de Docker se
publican solo en loopback; Alimentos usa el puerto propio 13087 y el listener
de su `main` actual. Si están ocupados, el arranque falla y se revisa el
conflicto; no se paran contenedores ajenos ni se cambia a otro servidor.

| Recurso | Destino de la prueba |
|---|---|
| Alimentos real | Proceso hijo Node en `http://127.0.0.1:13087`; se inicia y cierra en cada corrida |
| PostgreSQL | `127.0.0.1:15435`, usuario/contraseña `cu011_e2e`; bases `alimentos_cu011_e2e` y `pagos_cu011_e2e` |
| Redis | `127.0.0.1:16382`, instancia exclusiva |
| RabbitMQ | `127.0.0.1:15675`, usuario/contraseña `cu011_e2e`, vhost `cu011` |
| Pagos real | `http://127.0.0.1:13088/api/v1`; dentro de Docker usa las instancias anteriores |
| Pasarela simulada | `127.0.0.1:13101`; Pagos la llama por `http://pasarela:3099` |

`entorno-e2e.ts` impone estos valores **antes de importar la aplicación**,
incluidos `POSTGRES_BD_PEDIDOS` y `PAGOS_URL`; no hereda sus destinos del `.env`.
La suite comprueba esas coordenadas antes de abrir conexiones o migrar.
No ejecutarla simultáneamente contra el mismo proyecto.

Los UUID son únicos por corrida. El teardown elimina solo sus registros de
Alimentos y claves Redis y cierra clientes; no trunca tablas ni ejecuta
FLUSHDB. El libro financiero se conserva en la base de pruebas hasta eliminar
sus volúmenes. El observador AMQP usa una cola exclusiva autoeliminable;
no consume ni purga `pedidos.establecimientos`. La cola durable puede conservar
mensajes de las corridas sin interferir con el observador de la siguiente.

Comprobaciones afectadas, en secuencia:

```bash
npm --prefix App/services/pagos ci
npm --prefix App/services/autenticacion ci
npm --prefix App/services/alimentos run lint
npm --prefix App/services/alimentos run build
REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16382 npm --prefix App/services/alimentos test -- --runInBand
npm --prefix App/services/pagos run lint
npm --prefix App/services/pagos run build
npm --prefix App/services/pagos test -- --runInBand
npm --prefix App/services/autenticacion run lint
npm --prefix App/services/autenticacion run build
npm --prefix App/services/autenticacion test -- --runInBand
```

Después de revisar resultados, eliminar **solo** los recursos de esta suite:

```bash
npm --prefix App/services/alimentos run test:e2e:limpiar
```

Ese comando contiene proyecto y archivo explícitos y elimina únicamente sus
contenedores/red/volúmenes. No usar la limpieza de `App/infra` para esta prueba.
