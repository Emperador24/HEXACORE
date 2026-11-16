# Aplicaciones sobre base única: copia transferida y base vacía

Migra conexiones/SQL/arranque de la funcionalidad existente; no completa CU,
F12, Operación ni defectos previos. El cambio habitual **no se ejecuta aquí**.
Ver [configuración/esquemas](../../README.md) y [referencia de ocho bases](../consolidacion/README.md).
Node 22.22.3 (`nvm install && nvm use`), npm ci, Docker/Compose. Las tareas pesadas
se ejecutan secuencialmente. `COMPOSE_PARALLEL_LIMIT=1` limita el paralelismo de
Compose; en macOS caffeinate puede evitar suspensión durante las pruebas.

## Referencias que se conservan

- hexacore-backend-e2e: ocho bases originales en solo lectura (PG 15435),
  Redis/RabbitMQ detenidos, sus volúmenes y pendientes intactos. No iniciar apps,
  semillas, preparadores o consumidores sobre ellos. Los TTL siguen transcurriendo.
- hexacore-consolidacion-e2e: referencia hexacore conciliada (PG 15437), ocho
  restauraciones y copias de preparación; no usarla para pruebas que escriben.
- Directorio privado del manifiesto y ocho dumps originales, fuera del repo;
  en la ejecución local /private/tmp/hexacore-consolidacion/ensayo-03.

Para obtener **otra** referencia desde cero: guía histórica, imágenes fijadas a
be57961472a0802c90a57d247fb67e96e6717b1b mediante git archive. No se versiona otra
implementación. `ensayo:historico -- --levantar` rechaza el proyecto ya existente.
La nueva test:infra ya no prepara bases históricas. No ejecutar el reinicio de
destino del ensayo anterior sobre una referencia que se quiere conservar.

## A. Copia identificada de los datos transferidos

Solo se arrancan los dos PG de referencia para leer. Los escritores permanecen
parados. Desde App/backend, con puertos 15439/16384/15679/16779/13105/13106 y
13109/13117/13110/18082 disponibles:

```bash
export COMPOSE_PARALLEL_LIMIT=1
npm run build
npm run build:boleteria
npm run build:trabajador
docker compose -p hexacore-consolidacion-e2e -f test/consolidacion/docker-compose.yml up -d --wait
docker compose -p hexacore-backend-e2e -f test/consolidacion/historico/docker-compose.e2e.yml start postgres
npm run datos:clonar-pruebas -- /tmp/hexacore-consolidacion/referencia-01
```

Usar el directorio real del manifiesto. clonar-referencia exige las etiquetas,
puertos, rol, identidad de servidores, huella/dumps y conciliación previa. Rechaza
una marca local ya existente. Copia Redis/RabbitMQ desde volúmenes originales
**montados solo lectura** hacia volúmenes nuevos vacíos; conserva el hostname
RabbitMQ para cargar su Mnesia, en otra red aislada. No conecta consumidores al
broker original. Restaura un dump custom de la referencia SQL en hexacore_e2e del
proyecto **hexacore-base-unica-e2e**, marca la base, compara los ocho inventarios
antes de escribir y guarda metadatos privados en .evidencia-e2e/base-unica.json.
No sobrescribe dump ni copia existente; si se interrumpe, conservar la evidencia
y revisar exclusivamente sus recursos identificados antes de otro ensayo.

Preparación y lectura inicial **antes de iniciar aplicaciones o añadir fixtures**:

```bash
NODE_ENV=test POSTGRES_HOST=127.0.0.1 POSTGRES_PUERTO=15439 \
POSTGRES_USUARIO=cu011_e2e POSTGRES_CONTRASENA=cu011_e2e POSTGRES_BD=hexacore_e2e \
npm run datos:preparar
npm run datos:lectura-transferida
npm run datos:verificar-preparacion
npm run test:imagen:infra
npm run datos:flujos
npm run datos:ejecucion
npm run test:imagen
npm run test:boleteria:imagen
npm run test:pagos:convivencia
npm run test:pagos:contratos
node test/base-unica/comparar-conservados.cjs
```

Lectura inicial abre ocho DataSources reales y consulta entidades conservadas:
cuentas/pedidos/personal/compras/propietarios/QR/auditoría/libro. Comprueba los 18
historiales, incluido migrations de Postventa, search_path, base efectiva y ausencia
de DDL pendiente/tablas public. No sustituye esos datos por semillas. La preparación
aplica **cero migraciones** sobre A. La prueba de concurrencia ejecuta dos tareas
centrales simultáneas y exige cero reaplicaciones; una variable heredada debe fallar.

El escenario de 46 comprobaciones reutiliza el preparador histórico con destinos
acotados: login, alimentos, promociones/pago/cancelación/reembolso, reventa/QR/ingreso,
propietarios, asignación, solicitud/revisión y asistencia. Añade UUID propios.
Las cinco pruebas de ejecución inspeccionan configuración Docker y procesos,
pg_stat_activity (nueve pools de la misma base, incluido el libro desde ambos),
login/lectura/revocación, correo de Identidad al simulador, consumidores/pendientes
y los dos triggers inmutables. Boletería solo pública JWT, sin secreto webhook;
Trabajador sin SQL/Redis/JWT/Pagos. El callback solo va al Núcleo.

comparar-conservados exige todas las PK originales presentes y filas iguales,
salvo campos enumerados y transiciones comprobadas: fechas de acceso de las dos
cuentas del ensayo, pedidos/reservas vencidos y compras EXPIRADA con motivo
CU-001B/contador de reservadas. No repara ni borra registros. Libro, QR, propietarios,
auditoría y migraciones originales deben seguir idénticos. El delta privado enumera
campos, sin versionar filas. Las nuevas operaciones no se confunden con diferencias
de transferencia. Los siete pendientes originales siguen en el broker original;
la copia procesa correos, pero pedidos.establecimientos sigue sin consumidor.

Regresiones por proceso (parar antes las cuatro imágenes; conservar infraestructura):

```bash
node test/base-unica/cerrar-aplicaciones.cjs
npm run test:e2e
npm run test:boleteria
npm run test:pagos:modulo
npm run test:trabajador:infra
npm run test:trabajador
npm run test:trabajador:identidad
# Al terminar A y antes de B, parar todo A, sin eliminar datos:
npm run test:limpiar
```

test:infra prepara recursos y diez historiales/22 migraciones antes de los procesos. No migran los
bootstraps. Las suites conservan aserciones de cierre SIGTERM/pools/cron/outbox y
sin SIGKILL. Los contratos financieros reinician las dos imágenes, conservando
libro/referencias y fecha de terminación de la tarea de preparación.

## B. Instalación realmente vacía

**Otro proyecto**, hexacore-base-vacia-e2e, volúmenes/red/broker/Redis propios.
Los mismos puertos se reutilizan después de parar A. No se borra ni reutiliza la
base transferida para fingir una instalación nueva. Desde la misma terminal:

```bash
export POSTGRES_BD_PRUEBAS=hexacore_vacia_e2e
npm run test:imagen:infra
node test/base-unica/lectura-vacia.cjs # antes de datos:flujos o cualquier otra escritura
python3 test/base-unica/comprobar-auxiliares.py # 13 consultas de base/schema, sin ejecutar suites antiguas
npm run datos:verificar-preparacion
npm run datos:flujos
npm run datos:ejecucion
npm run test:imagen
npm run test:boleteria:imagen
npm run test:pagos:convivencia
npm run test:pagos:contratos
node test/base-unica/cerrar-aplicaciones.cjs
npm run test:e2e
npm run test:boleteria
npm run test:trabajador:identidad
npm run test:limpiar
unset POSTGRES_BD_PRUEBAS
```

Primera preparación: **22 aplicadas** (18 consolidadas + CU-007, CU-026, CU-029 y CU-019); lectura inicial: 63 tablas, 22 filas de
historial + cuatro roles, ninguna otra fila de negocio ni tabla public. Sin semillas.
Repetición concurrente: cero reaplicadas. Entidades, extensiones, enums, secuencias,
restricciones, funciones y triggers se crean con las fuentes originales adaptadas
al namespace. Las mismas operaciones/regresiones prueban su compatibilidad.
Los 13 auxiliares SQL de guiones HTTP conservan aserciones y formatos de respuesta,
pero apuntan a POSTGRES_BD y a su namespace. Los argumentos antiguos de base de
Entradas solo eligen propietario lógico. La comprobación AST extrae únicamente
su función sql, con contenedor/usuario de fixture explícitos y validación del
proyecto B; no importa sus módulos, siembra ni pausa recursos. Los guiones completos
siguen fuera de esta ejecución porque pueden modificar el entorno habitual.

Si B ya existe se reconoce su historial; lectura-vacia debe fallar tras crear datos,
como corresponde. Para repetir flujos usar UUID nuevos, sin vaciar la base.

## Límites, cierre y cambio habitual pendiente

Compartir base no añade transacciones entre proyecciones ni invalida el QR de
inmediato. Se conservan autoridades, compensaciones, outbox y tablas legacy.
Webhook auténtico actualiza el libro/publica; **F12 no finaliza el pedido pendiente**.
F13 puede reproducirse con Query read timeout: observador de solo lectura y logs,
sin aumentar límites. F14 conserva listado global de notificaciones logísticas.
F15 conserva deduplicación/intentos en memoria, mensajes inválidos incompletamente
validados, duplicados ante reinicio y carrera de resuscripción tras fallo inicial.
No se corrigen silenciosamente fallos previos para declarar verde.

`test:limpiar` y `test:trabajador:limpiar` solo paran sus proyectos. Al terminar,
parar también los dos PG de referencia si estaban detenidos antes del ensayo.
No down -v, purge, FLUSH, cambios de TTL ni inicialización de inventario anterior.
La preparación central usa la misma base y bloqueo, no un servidor adicional.
CI tiene un job separado para reconstrucción histórica → A → B; configuración
preparada no acredita ejecución remota ni publicación de imágenes.

Antes del cambio habitual: acordar pausa común de escritores/callbacks/cron,
respaldar y conciliar las ocho bases, preservar/drenar mensajes y reservas según
sus dueños, transferir y ejecutar preparación central antes de abrir tráfico.
La parada de escritores aporta coherencia entre dumps, no varios pg_dump por sí
solos. Revertir antes de nuevas escrituras permite volver coordinadamente a las
bases/configuración anteriores; después requiere copia inversa/conciliación
autorizada. Volver de imagen no revierte datos. No se ejecutó ese corte ni RNF-15.
