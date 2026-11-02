# Backend HEXACORE: Núcleo y Boletería

Etapa intermedia: Identidad, Alimentos y Personal/Logística corren en **un solo proceso NestJS**.
Boletería reúne Ventas, Catálogo, Cola, Postventa y Acceso QR en otro proceso.
Pagos está en modulos/finanzas/pagos, con una envoltura HTTP temporal en apps/pagos-http.
Núcleo y Boletería siguen llamándola por HTTP. Notificaciones conserva su paquete separado.
Angular y sus compiladores permanecen fuera de este workspace.
La consolidación de datos de Boletería, Operación y Trabajador siguen pendientes del plan.

```text
backend/
  apps/nucleo/         main, composición y disponibilidad del Núcleo
  apps/boleteria/      main, composición y disponibilidad de Boletería
  apps/pagos-http/     compatibilidad HTTP temporal, sin duplicar negocio
  modulos/finanzas/pagos/ libro, cobros, reembolsos, pasarela y 1 migración existente
  modulos/identidad/   cuentas, sesiones, administración, entidades y 3 migraciones
  modulos/alimentos/   catálogo, menú, checkout, inventario, pagos y 2 migraciones
  modulos/entradas/    ventas, catálogo, fila, postventa y acceso QR; 10 migraciones
  modulos/personal-logistica/ empleados, turnos, asistencia y 2 migraciones
  compartido/         configuración del proceso, Redis, RabbitMQ, hilos y validación
  test/               unitarias, CU-011/convivencia, infraestructura e imágenes
  package.json        manifiesto común; package-lock.json único
```

## Instalación y arranque

Desde `App/backend`, seleccionar **Node 22.22.3**:

```bash
nvm install
nvm use
node --version                 # v22.22.3
npm ci
cp .env.example .env            # ajustar destinos propios antes de escribir datos
npm run lint
npm run build
```

El lockfile procede del Alimentos probado en `25a4fd3`: versiones resueltas
idénticas, sin upgrades. La etapa de Personal añade Supertest y sus tipos solo para pruebas; no actualiza
paquetes previos. Se conserva la entrada anidada original de Webpack necesaria
para que npm ci funcione tanto con npm 10 del contenedor como con npm 11 del host.
Nest 11, TypeORM 1 y TypeScript 5.9 permanecen fuera del compilador Angular.

Las bases **administracion**, **pedidos** y **eventos_emergencias** deben existir. Se conservan tablas,
identificadores e historiales `migraciones`. No se consolida ni copia información.
Aplicar explícitamente sus migraciones, tras revisar el `.env`:

```bash
npm run migracion:identidad:estado
npm run migracion:alimentos:estado
npm run migracion:logistica:estado
npm run migracion:identidad:correr
npm run migracion:alimentos:correr
npm run migracion:logistica:correr
npm run start:prod              # node dist/apps/nucleo/main.js, puerto 3002
# Desarrollo: npm run start:dev
```

`synchronize=false` y `migrationsRun=false`. El Dockerfile aplica los tres historiales
antes del único `main`; con réplicas, las migraciones deben ser una tarea única de
despliegue. No se certifica aquí el sondeo de inventario entre réplicas de Núcleo.
El override de escalado conserva el escalado independiente de Ventas.

Las semillas son explícitas: `semilla:identidad`, `semilla:alimentos`, `semilla:logistica`; pueden
reemplazar datos. **No forman parte de las instrucciones de integración aislada**.
El inventario se prepara con `npm run inventario:preparar -- <UUID> --compras-detenidas`
solo después de detener compras y cambios de stock en todas las instancias.

## Contratos y conexiones

Se conservan `/api/v1/cuentas`, `/sesiones`, `/admin/cuentas`, `/pedidos` y `/logistica`, incluidos
DTO, respuestas, cookies web HttpOnly, renovación móvil, RS256, roles y revocación
`sesion-revocada:<jti>`. El gateway enruta las cinco familias a `nucleo:3002`;
web y móvil mantienen sus URLs públicas. Se retiran los puertos directos antiguos 3007 y 3016.
Swagger reúne los tres módulos en `/api/v1/docs` fuera de producción.

La configuración común tiene token `CONFIGURACION_PROCESO_NUCLEO`; cada dominio
conserva su token `CONFIGURACION_IDENTIDAD`/`CONFIGURACION_ALIMENTOS`/`CONFIGURACION_PERSONAL_LOGISTICA`. TypeORM usa
conexiones **identidad**, **alimentos** y **personal-logistica** tanto en `forRootAsync` como en la fábrica,
`forFeature` e inyecciones. No existe conexión por defecto en Núcleo.

Hay un cliente Redis común para revocaciones y una conexión RabbitMQ con las tres
topologías. Inventario conserva su cliente Redis especializado, con sus opciones
de timeout/reenvío propias. Solo sus propietarios cierran clientes; el servicio
de revocaciones ya no cierra el Redis compartido. Se conserva un único sondeo de
reservas y la inicialización del pool libuv antes de cargar Nest/crypto/pg.

**Disponibilidad:** `GET /api/v1/salud` devuelve `servicio=nucleo`, comprueba las tres
bases y Redis y responde 503 si falta cualquiera. RabbitMQ se informa como antes:
su caída degrada el estado, sin impedir por sí sola la disponibilidad. Cada consulta
tiene límite de un segundo. Esta política reúne la necesidad de Redis de Alimentos
con la de las tres bases. El login directo sigue teniendo sus errores anteriores.

## Verificación

Las instrucciones completas están en [test/README.md](test/README.md).
Desde aquí:

```bash
npm run test:e2e:infra
REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16382 npm test -- --runInBand
npm run test:e2e
npm run test:e2e
npm run verificar:infra
npm run test:imagen:infra
npm run test:imagen
npm run test:imagen
npm run test:e2e:limpiar
```

No ejecutar el E2E por proceso mientras la imagen Núcleo de pruebas esté arriba:
la suite exige una sola conexión de Núcleo al broker y ninguna al terminar. Parar
solo las imágenes propias con el Compose combinado antes de repetir esa suite.
CI realiza estos pasos en ese orden y recoge logs de su proyecto si fallan.

Los guiones HTTP históricos se conservan en `modulos/*/pruebas`; varios siembran,
pausan dependencias o controlan contenedores habituales. No se ejecutaron aquí ni
se recomiendan para verificar esta etapa. Usar la integración aislada anterior.
El helper histórico de cobertura delega ahora a `test:cov:e2e` sin detener servidores;
no se afirma un porcentaje de cobertura sin ejecutar esa medición.

## Personal/Logística: compatibilidad y alcance

[El módulo](modulos/personal-logistica/README.md) conserva CU-017/CU-018 y sus
funciones solapadas con CU-007–009. Usa Nest 11/TS 5.9 del workspace; se retiran
Nest 12/TS 6 y Vitest del servidor anterior. Solo se añaden Supertest 7.2.2 y sus
tipos 7.2.1 como herramientas de prueba, en las versiones originales. Las 59
pruebas pasan a Jest y HTTP contra el proceso compilado, conservando sus aserciones.
No hay nuevos paquetes de negocio ni sincronización automática de esquema.

`DB_NAME` conserva `eventos_emergencias`; DB_HOST/PORT/USER/PASSWORD mantienen
las variables anteriores y, si faltan, usan las coordenadas comunes POSTGRES_*.
La cola y DLQ `turnos.cambios` conservan el prefijo opcional PREFIJO_COLAS.
La conexión compartida declara su topología y resuscribe un consumidor; al cerrar,
este cancela recepción y espera el trabajo en curso antes de cerrar conexiones.

El traslado no implementa Operación, planificación completa ni proveedores.
F12 sigue pendiente. F13 se observa con el comando opcional de solo lectura:

```bash
python3 test/observar-recursos.py --segundos 100
```

Ejecutarlo en otra terminal mientras las pruebas o imágenes propias están arriba.
Captura consultas, bloqueos, conexiones, CPU/memoria y logs solo del proyecto
hexacore-nucleo-e2e; no incrementa límites ni da F13 por resuelto.


## Boletería: instalación, datos y ejecución

Mismo npm ci/Node 22.22.3 del workspace, sin compiladores Angular. Conserva
Nest 11/TS 5.9 y las versiones resueltas anteriores. Añade @nestjs/schedule
**12.0.2**, la versión de Ventas/Postventa existente, compatible con ese core.
AJV 8.18.0 y ajv-formats 3.0.1 se declaran como dev directas para las pruebas de
contrato; ya estaban resueltas en el workspace y sus aserciones se ejecutaron.
El lockfile conserva la entrada Webpack requerida por npm 10 de la imagen.

Boletería usa POSTGRES_BD_VENTAS=entradas_mercado_secundario,
POSTGRES_BD_CATALOGO=catalogo, POSTGRES_BD_POSTVENTA=postventa y
POSTGRES_BD_ACCESO_QR=acceso_qr. Se ignora POSTGRES_BASE genérico para impedir
que una configuración antigua mezcle las bases, también en los comandos CLI.
Coordenadas POSTGRES_*, Redis y Rabbit son comunes al proceso; cada componente
tiene su configuración y conexión TypeORM nombrada. No se consolidan datos.

Desde App/backend y tras revisar destinos del .env:

```bash
npm run lint
npm run build:boleteria
npm run migracion:ventas:estado
npm run migracion:catalogo:estado
npm run migracion:postventa:estado
npm run migracion:acceso-qr:estado
npm run migracion:ventas:correr
npm run migracion:catalogo:correr
npm run migracion:postventa:correr
npm run migracion:acceso-qr:correr
PUERTO=3001 npm run start:boleteria
# Núcleo se ejecuta aparte con PUERTO=3002 npm run start:prod.
```

Dockerfile.boleteria aplica los cuatro historiales y ejecuta un solo main;
Dockerfile conserva el Núcleo. Las migraciones deben ser tarea única al desplegar
réplicas. La sonda directa `/api/v1/salud` informa cuatro bases, Redis, RabbitMQ,
PID y los dos cron. Bases/Redis caídos producen 503; RabbitMQ degrada el estado
sin cambiar por sí solo el HTTP 200. `/api/v1/salud` del gateway sigue en Núcleo.

Las cinco familias públicas llegan a boleteria:3001. El gateway conserva JWT/roles
y consume el turno mediante el endpoint interno de la fila antes de reservar.
Postventa usa la API local de Ventas; las rutas internas HTTP conservan sus
restricciones y no se exponen en el gateway. Firma JWT solo Identidad.

Ver [composición/consistencia](modulos/entradas/README.md) y los
[comandos de integración e imagen](test/boleteria/README.md). Las esperas de
proyecciones no prueban invalidación inmediata ni atomicidad entre bases.
No se certifican réplicas, carga, GHCR ni CI/CD remoto con un smoke local.

## Pagos: primer hito de extracción

Se migró la implementación existente, sin completar casos pendientes. Con Node
22.22.3 y las mismas dependencias, `npm run build:pagos` y
`PUERTO=3008 npm run start:pagos` ejecutan la envoltura temporal. Antes de migrar,
revisar destinos y ejecutar `migracion:pagos:estado`/`migracion:pagos:correr`;
POSTGRES_BD_PAGOS selecciona la base existente pagos. Dockerfile.pagos usa ese
mismo código y aplica su historial migraciones. No hay consolidación de datos.

La API reutilizable no registra endpoints ni JWT/Redis/AMQP; la envoltura conserva
esos contratos. [Módulo](modulos/finanzas/pagos/README.md),
[arranque y retirada posterior](apps/pagos-http/README.md) y
[comandos de pruebas aisladas](test/pagos/README.md). F12 permanece pendiente: un
webhook financiero no equivale a finalizar el pedido o compra. Completar CU
ausentes es responsabilidad funcional de cada integrante, fuera de la migración.
