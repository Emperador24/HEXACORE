# Backend HEXACORE

Se migra la funcionalidad existente, sin completar los CU pendientes. Node **22.22.3**,
Nest 11 y TypeScript 5.9; un manifiesto y lockfile. Angular permanece fuera.

```text
apps/nucleo/         Identidad, Alimentos, Personal/Logística y webhook financiero
apps/boleteria/      Ventas, Catálogo, Cola, Postventa y Acceso QR
apps/trabajador/     consumidor de correo y salud técnica, sin SQL/Redis/JWT/Pagos
modulos/            una fuente de las reglas de cada dominio
compartido/config/  configuración común de destino PostgreSQL
compartido/persistencia/ esquemas, adaptación de migraciones y preparación única
```

Pagos es un módulo importado por ambos programas; conserva HTTP solo hacia la
pasarela. Monitoreo y evacuación de Operación ya están dentro de Núcleo;
su separación en proceso sigue pendiente. CU-015: [reglas de Alimentos](modulos/alimentos/README.md)
y [demostración integrada](../e2e/README.md).

## Instalar y preparar

Desde App/backend:

```bash
nvm install && nvm use          # .nvmrc: 22.22.3
node --version                 # v22.22.3
npm ci
cp .env.example .env            # revisar destino antes de cualquier escritura
npm run lint
npm run build
npm run build:boleteria
npm run build:trabajador
```

No se actualizaron dependencias en la etapa de esquemas. La base elegida debe
existir. Todas las conexiones usan **POSTGRES_HOST, POSTGRES_PUERTO,
POSTGRES_USUARIO, POSTGRES_CONTRASENA, POSTGRES_BD**; por defecto hexacore.
Se rechaza la presencia de POSTGRES_BASE, POSTGRES_BD_ADMINISTRACION/PEDIDOS/
VENTAS/CATALOGO/POSTVENTA/ACCESO_QR/PAGOS y DB_HOST/PORT/USER/PASSWORD/NAME,
incluso vacías. Quitarlas del entorno y del .env; no se ignoran silenciosamente.

| Conexión Nest/TypeORM | Esquema | Historial / migraciones |
|---|---|---|
| identidad | identidad | migraciones / 3 |
| alimentos | alimentos | migraciones / 5 |
| personal-logistica | personal_logistica | migraciones / 4 |
| entradas-ventas | entradas_ventas | migraciones / 5 |
| entradas-catalogo | entradas_catalogo | migraciones / 1 |
| entradas-postventa | entradas_postventa | **migrations** / 1 |
| entradas-acceso-qr | entradas_acceso_qr | migraciones / 3 |
| finanzas-pagos | finanzas_pagos | migraciones / 1 |
| eventos-recintos | eventos_recintos | migraciones / 2 |
| operacion | operacion | migraciones / 2 |
| parqueaderos | parqueaderos | migraciones / 1 |

Cada pool usa solo su esquema, pg_catalog y extensiones en search_path. No se
mezclan los once propietarios (28 migraciones; 18 procedencias históricas). synchronize=false, migrationsRun=false e
installExtensions=false en todas las conexiones. Extensiones uuid-ossp 1.1 y
pgcrypto 1.3 se preparan centralmente en extensiones. pg_catalog precede al
homónimo gen_random_uuid de pgcrypto. No se modifican las 18 fuentes históricas:
el adaptador conserva nombres y cambia solo su cualificación DDL `"public".`.
Procedencia original y SHA-256 quedan en migracion_control.procedencia.

```bash
npm run datos:preparar          # UNA tarea antes de habilitar aplicaciones
npm run migracion:identidad:estado
npm run migracion:postventa:estado
# Después, en procesos separados y con los mismos POSTGRES_*:
PUERTO=3002 npm run start:prod
PUERTO=3001 npm run start:boleteria
# Trabajador usa únicamente su .env.trabajador:
cp apps/trabajador/.env.example .env.trabajador
npm run start:trabajador
```

La preparación usa un bloqueo asesor de sesión en la base: dos tareas simultáneas
se serializan. Cada historial se aplica en transacción; un fallo devuelve salida
no cero y bloquea el despliegue. La repetición reconoce los historiales y no duplica
DDL. Los alias migracion:*:correr delegan a esta misma tarea; no ejecutarlos por
módulo. Se retiran los alias de reversión individual para evitar deshacer un
historial aislado de una instalación compartida. Ningún Dockerfile/bootstrap migra.
Compose ejecuta preparacion-base con la imagen Núcleo, sin servidor ni claves,
y ambas apps esperan su salida 0. Las imágenes arrancan directamente su main.

La configuración está probada **solo en infraestructura aislada**, tanto sobre
copia transferida como vacía. **El entorno habitual sigue con sus bases anteriores**.
No ejecutar iniciar.sh sobre él para migrar: requiere un corte autorizado, respaldo,
transferencia y conciliación. El script rechaza instalaciones anteriores detectadas,
no carga semillas por defecto y limita --datos-demo npm a instalación local vacía.
Las semillas pueden truncar datos; no forman parte de estas pruebas.

## Contratos y disponibilidad

Núcleo conserva /api/v1/cuentas, /sesiones, /admin/cuentas, /pedidos y /logistica;
gateway envía esas familias a nucleo:3002. Se conservan DTO, cookies HttpOnly,
renovación, RS256, roles, revocación sesion-revocada:<jti> y preparación de libuv
antes de cargar Nest/crypto/pg. Swagger /api/v1/docs fuera de producción.
Configuración por dominio, Redis común de revocación y cliente especializado de
inventario; una conexión RabbitMQ compartida por Núcleo, sin duplicar topologías.

Boletería conserva las cinco familias públicas en boleteria:3001 y el consumo
único del turno en gateway. Usa únicamente clave pública y revocación; firma solo
Identidad. Postventa usa la API local de Ventas; las rutas internas mantienen sus
restricciones y no se publican en gateway. Se conservan cron/outbox/proyecciones.

GET /api/v1/salud comprueba **las tablas de historial en los esquemas esperados**:
cuatro pools de Núcleo y cinco de Boletería, incluidos ambos finanzas-pagos.
SQL/Redis ausentes producen 503; RabbitMQ degrada el estado sin cambiar por sí
solo el HTTP 200, como antes. Gateway /salud corresponde al Núcleo. Trabajador
conserva servicio=notificaciones y 503 sin broker; no sondea el proveedor.

Ambos procesos usan **finanzas_pagos.transacciones_pago**, mismo libro, referencias,
solicitantes, importes y claves sin prefijos por proceso. Solo Núcleo monta
POST /api/v1/pagos/webhook: rawBody/HMAC de bytes originales, actualización del
libro y publicación por su RabbitMQ compartido; 503 si publicación no confirmada.
Boletería no recibe secreto HMAC ni clave privada. Importar Pagos no monta cobros
ni reembolsos HTTP. Los pools financieros se identifican como finanzas-pagos:nucleo
y finanzas-pagos:boleteria; esos nombres no alteran las claves de idempotencia.

**No hay nueva atomicidad** por compartir base: Ventas conserva autoridad de
propiedad/QR/historial, Acceso QR una proyección, Catálogo referencias y Postventa
publicaciones/transacciones. Se mantienen tablas legacy y compensaciones. F12
sigue pendiente: actualizar el libro con webhook no finaliza un pedido/compra incierto.
F13 (timeouts), F14 (alcance de listado logístico) y F15 (correo) siguen identificados.
No se implementan alertas operativas ni nuevos trabajos.

## Verificar y reproducir

[Guía general](test/README.md), [base transferida/vacía](test/base-unica/README.md),
[ensayo histórico de ocho bases](test/consolidacion/README.md),
[Entradas](modulos/entradas/README.md), [Pagos](test/pagos/README.md),
[Personal/Logística](modulos/personal-logistica/README.md),
[correo y límites](modulos/comunicaciones/README.md).
Los scripts HTTP históricos pueden sembrar o detener recursos habituales: no se
usan para esta entrega. No se certifican interfaces, carga, réplicas, RNF-15,
publicación GHCR o CI/CD remoto mediante pruebas locales.

## Cierre y continuación por el equipo

[ADR-16/guía por integrante](../../Documentation/Work/GUIA-EQUIPO-MIGRACION.md),
[corte y reversión pendientes](../../Documentation/Work/CORTE-Y-REVERSION.md),
[imágenes publicadas](test/publicadas/README.md). Las referencias y comandos de
servidores individuales en README de componentes de Entradas se conservan como
historia; el arranque vigente es el de este workspace. No ejecutar la limpieza
histórica de ocho bases: está retirada y no actúa sobre datos.
