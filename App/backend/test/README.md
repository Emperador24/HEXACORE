# Integración aislada del backend

Node **22.22.3**, npm ci en App/backend, Docker y Compose con !reset/!override.
Probado con Docker 29.7.2 / Compose 5.3.1. Seleccionar `nvm install && nvm use`.
Alternativa sin nvm, fuera del repositorio:

```bash
npm install --prefix /private/tmp/hexacore-node22 node@22.22.3 --no-save --no-package-lock
export PATH="/private/tmp/hexacore-node22/node_modules/.bin:$PATH"
node --version
```

**No ejecutar iniciar.sh, semillas ni guiones históricos que truncan tablas.**
El proyecto anterior hexacore-backend-e2e queda reservado a la referencia inmóvil
con ocho bases; su preparación está en [consolidacion](consolidacion/README.md).
El recorrido sobre copia transferida y el recorrido vacío se describen en
[base-unica](base-unica/README.md). No sobrescribir esa referencia para empezar pruebas.

| Recurso activo de pruebas | Destino loopback |
|---|---|
| Proyecto A / base | hexacore-base-unica-e2e / hexacore_e2e |
| Proyecto B / base | hexacore-base-vacia-e2e / hexacore_vacia_e2e |
| PostgreSQL, usuario/clave de fixture | 15439 / cu011_e2e |
| Redis | 16384 |
| RabbitMQ, vhost cu011 | 15679 / administración 16779 |
| Pasarela / correo simulados | 13105 / 13106 |
| Imágenes Núcleo / Boletería / Trabajador / gateway | 13109 / 13117 / 13110 / 18082 |
| Procesos compilados de Núcleo / Boletería | 13087 / 13096 |

A y B usan los mismos puertos **secuencialmente**, con redes/volúmenes diferentes.
Antes de B parar A; exportar POSTGRES_BD_PRUEBAS=hexacore_vacia_e2e en **cada**
comando B. Nunca hay servidor Pagos; el único webhook vive en Núcleo.
Las claves RSA/HMAC son fixtures públicos exclusivos. Boletería/gateway solo
reciben clave pública. Trabajador solo RabbitMQ/proveedor de correo.

Desde App/backend, sobre A ya clonado o B seleccionado:

```bash
npm run lint
npm run build
npm run build:boleteria
npm run build:trabajador
npm run test:infra                 # recursos y preparacion-base, sin apps
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16384 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16384 npm test -- --runInBand
npm run test:e2e                   # 93 escenarios Núcleo (11 de CU-007, 9 de CU-026), proceso compilado
npm run test:boleteria             # 23 escenarios Boletería y auxiliar webhook
npm run test:pagos:modulo
npm run verificar:infra
npm run test:imagen:infra          # tres imágenes + gateway + simuladores
npm run datos:flujos               # 46 comprobaciones con UUID propios
npm run datos:ejecucion            # 5 pruebas de pools/datos/correo/colas/triggers
npm run test:imagen
npm run test:boleteria:imagen
npm run test:pagos:contratos        # 13 escenarios
npm run test:pagos:convivencia      # 5 escenarios y reinicio de ambas apps
npm run test:limpiar               # STOP del proyecto seleccionado; conserva volúmenes
```

Ejecutar tareas pesadas secuencialmente. No ejecutar suites por proceso con las
imágenes activas: las aserciones exigen ausencia de otros pools/consumidores al
cerrar. Para volver a ellas:

```bash
node test/base-unica/compose.cjs imagenes stop gateway nucleo boleteria trabajador
```

El preparador central es el único que aplica 20 migraciones (18 consolidadas + CU-007 +
esquema de CU-026); los helpers reconocen historias existentes. Se conservan 57 tablas en nueve esquemas, sin tablas de
negocio public. Cada corrida añade UUID propios, sin TRUNCATE/FLUSH/purge,
sin borrar mensajes anteriores ni modificar TTL. El inventario del fixture se
prepara antes de habilitar sus compras; no se usa semilla de desarrollo.

Jest inicia `dist/apps/*/main.js` como procesos reales para conservar ESM de
TypeORM fuera de su runtime CommonJS. Se conservan los cinco escenarios CU-011,
login/perfil/cookies/renovación/revocación y las reglas/logística trasladadas.
Boletería comprueba reservas/reventa concurrentes, promociones, pagos,
reembolsos, propietarios/QR/proyección, doble ingreso, cron y reconexión.
SIGTERM exige cierre sin SIGKILL y desaparición de pools, cron, Redis y AMQP.
Los smokes usan Nginx/njs real y comprueban cada programa en su upstream único.
[Pagos](pagos/README.md) conserva contratos inciertos/webhook; [Trabajador](trabajador/README.md)
usa otro broker exclusivo para sus 20+3 pruebas, sin enviar correo real.

Evidencias privadas en .evidencia-e2e y /private/tmp, ignoradas por Git. No se
versionan dumps, RDB, JWT, correos ni filas. En macOS puede usarse
`caffeinate -dimsu npm run <tarea>` para impedir suspensión del equipo durante
la medición; no modifica timeouts ni TTL de los recursos.

F13 se observa con `python3 test/observar-recursos.py --segundos 100` o el
observador de boleteria; guarda consultas, pg_blocking_pids, locks, conexiones y
recursos propios. No aumentar límites para presentar el fallo como resuelto.
Resultados y fallos, incluidos intentos no aprobados, en ESTADO-MIGRACION §23.
