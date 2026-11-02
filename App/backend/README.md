# Backend HEXACORE: Núcleo modular

Etapa intermedia: Identidad y Alimentos corren en **un solo proceso NestJS**.
Pagos y los otros siete backends actuales conservan paquetes y procesos separados.
No se trasladan Personal/Logística, Angular ni sus compiladores a este workspace.
Boletería, Operación y Trabajador siguen siendo destinos posteriores del plan.

```text
backend/
  apps/nucleo/         main, composición y única sonda de disponibilidad
  modulos/identidad/   cuentas, sesiones, administración, entidades y 3 migraciones
  modulos/alimentos/   catálogo, menú, checkout, inventario, pagos y 2 migraciones
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
idénticas, sin upgrades. Se unifica únicamente el nombre raíz y se fija Node.
Nest 11, TypeORM 1 y TypeScript 5.9 permanecen fuera del compilador Angular.

Las bases **administracion** y **pedidos** deben existir. Se conservan tablas,
identificadores e historiales `migraciones`. No se consolida ni copia información.
Aplicar explícitamente sus migraciones, tras revisar el `.env`:

```bash
npm run migracion:identidad:estado
npm run migracion:alimentos:estado
npm run migracion:identidad:correr
npm run migracion:alimentos:correr
npm run start:prod              # node dist/apps/nucleo/main.js, puerto 3002
# Desarrollo: npm run start:dev
```

`synchronize=false` y `migrationsRun=false`. El Dockerfile aplica ambos historiales
antes del único `main`; con réplicas, las migraciones deben ser una tarea única de
despliegue. No se certifica aquí el sondeo de inventario entre réplicas de Núcleo.
El override de escalado conserva el escalado independiente de Ventas.

Las semillas son explícitas: `semilla:identidad`, `semilla:alimentos`; pueden
reemplazar datos. **No forman parte de las instrucciones de integración aislada**.
El inventario se prepara con `npm run inventario:preparar -- <UUID> --compras-detenidas`
solo después de detener compras y cambios de stock en todas las instancias.

## Contratos y conexiones

Se conservan `/api/v1/cuentas`, `/sesiones`, `/admin/cuentas` y `/pedidos`, incluidos
DTO, respuestas, cookies web HttpOnly, renovación móvil, RS256, roles y revocación
`sesion-revocada:<jti>`. El gateway enruta las cuatro familias a `nucleo:3002`;
web y móvil mantienen sus URLs públicas. El puerto directo antiguo 3007 se retira.
Swagger reúne ambos módulos en `/api/v1/docs` fuera de producción.

La configuración común tiene token `CONFIGURACION_PROCESO_NUCLEO`; cada dominio
conserva su token `CONFIGURACION_IDENTIDAD`/`CONFIGURACION_ALIMENTOS`. TypeORM usa
conexiones **identidad** y **alimentos** tanto en `forRootAsync` como en la fábrica,
`forFeature` e inyecciones. No existe conexión por defecto en Núcleo.

Hay un cliente Redis común para revocaciones y una conexión RabbitMQ con las dos
topologías. Inventario conserva su cliente Redis especializado, con sus opciones
de timeout/reenvío propias. Solo sus propietarios cierran clientes; el servicio
de revocaciones ya no cierra el Redis compartido. Se conserva un único sondeo de
reservas y la inicialización del pool libuv antes de cargar Nest/crypto/pg.

**Disponibilidad:** `GET /api/v1/salud` devuelve `servicio=nucleo`, comprueba ambas
bases y Redis y responde 503 si falta cualquiera. RabbitMQ se informa como antes:
su caída degrada el estado, sin impedir por sí sola la disponibilidad. Cada consulta
tiene límite de un segundo. Esta política reúne la necesidad de Redis de Alimentos
con la de las dos bases. El login directo sigue teniendo sus errores anteriores.

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
