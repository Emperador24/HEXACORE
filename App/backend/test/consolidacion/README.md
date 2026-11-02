# Ensayo aislado: ocho bases → hexacore con esquemas

Migra **datos y estructura de la funcionalidad existente** en copias desechables.
No adapta las aplicaciones a hexacore, no fusiona autoridades/proyecciones ni
resuelve F12, F13, F14, F15 o casos de uso pendientes. No es un procedimiento
autorizado para producción/desarrollo habitual. El cambio de destinos es otro hito.

## Mapa definitivo de esta transferencia

Cada tabla conserva su nombre, filas, PK, FK, índices, tipos y secuencias dentro
del esquema indicado. La tabla de historial también se traslada, **con sus ID**:

| Conexión / base habitual (solo referencia) | Base origen exclusiva | Esquema de hexacore | Tablas, incluido historial | Migraciones |
|---|---|---|---|---|
| identidad / administracion | identidad_cu011_e2e | identidad | auditoria_cuentas, migraciones, roles, sesiones, tokens_cuenta, usuarios, usuarios_roles | 3 |
| alimentos / pedidos | alimentos_cu011_e2e | alimentos | detalles_pedido, establecimientos, eventos_referencia, migraciones, pedidos, productos, reservas_inventario, transacciones_pedido | 2 |
| personal-logistica / eventos_emergencias | eventos_emergencias_nucleo_e2e | personal_logistica | empleados, migraciones, notificaciones, registros_asistencia, solicitudes_cambio_turno, turnos, zonas_evento | 2 |
| entradas-ventas / entradas_mercado_secundario | entradas_e2e | entradas_ventas | cancelaciones, codigos_promocionales, compras, entradas, eventos_referencia, eventos_salientes, historial_propietarios, ingresos, localidades_evento, migraciones, publicaciones_reventa, transacciones_reventa, usos_promocion | 5 |
| entradas-catalogo / catalogo | catalogo_boleteria_e2e | entradas_catalogo | eventos_referencia, localidades_evento, migraciones | 1 |
| entradas-postventa / postventa | postventa_boleteria_e2e | entradas_postventa | eventos_referencia, **migrations**, publicaciones_reventa, transacciones_reventa | 1 |
| entradas-acceso-qr / acceso_qr | acceso_qr_boleteria_e2e | entradas_acceso_qr | eventos_referencia, eventos_salientes, ingresos, migraciones, qr_entradas | 3 |
| finanzas-pagos / pagos | pagos_e2e | finanzas_pagos | migraciones, transacciones_pago | 1 |

Entradas es el propietario de sus cuatro esquemas: la división conserva la
procedencia de sus datos actuales. Ventas conserva la autoridad de entrada,
propietario, QR e historial; Acceso QR conserva la proyección de hashes/estado y
el registro de ingreso, con propagación por outbox/eventos. Catálogo conserva
referencias/localidades y Postventa publicaciones/transacciones. Las tablas
legacy de reventa e ingresos de Ventas **no se unen** con las homónimas de otros
esquemas, aunque estén vacías. UUID iguales de eventos siguen siendo referencias
entre copias, no una autorización para fusionarlas. No se añade ninguna FK entre
dominios. No se certifica atomicidad de operaciones ni invalidación inmediata del QR.

Colisiones resueltas por espacio de nombres: eventos_referencia, localidades,
ingresos, publicaciones/transacciones de reventa, outbox, enums, índices y
numero_transaccion_seq. Hay siete historiales migraciones y uno migrations;
**no se crea un historial TypeORM global mezclado**. migracion_control.procedencia
registra conexión/base/esquema/historial, nombre, ruta y SHA-256 de las **18 fuentes
originales**, intactas. No ejecutar migration:run ni los Dockerfiles actuales
contra hexacore: la siguiente entrega debe configurar explícitamente cada esquema
e historial y comprobar migration:show antes de permitir escrituras.

Extensiones compartidas: **uuid-ossp 1.1** y **pgcrypto 1.3** pasan a extensiones;
plpgsql 1.0 permanece en pg_catalog. Se exige misma versión/propietario y que las
extensiones de public sean relocatables; se crea cada extensión una sola vez.
Se comprueban sus **49 funciones miembro**, además de las dos funciones de negocio.
No se crean esquemas vacíos para módulos todavía sin implementación.

## Aislamiento y requisitos

- Node **22.22.3** (.nvmrc), dependencias actuales (`npm ci`), Python no requerido.
  En el host del ensayo se seleccionó con
  `PATH=/private/tmp/hexacore-cu011-node22/node_modules/.bin:$PATH` (npm 11.6.3).
- Docker/Compose disponibles. Origen: proyecto **hexacore-backend-e2e**,
  PostgreSQL **127.0.0.1:15435**, Redis 16382, RabbitMQ 15675/16775,
  pasarela simulada 13101, Núcleo 13089, Boletería 13097 y gateway 18080.
- Destino/restauraciones: proyecto **hexacore-consolidacion-e2e**,
  PostgreSQL **127.0.0.1:15437**, red y volumen propios, etiqueta
  hexacore.uso=ensayo-consolidacion. Se probó **PostgreSQL 16.15** en ambos.
- Usuario/clave públicos de fixtures: cu011_e2e. Las herramientas no leen .env
  ni DATABASE_URL, y solo aceptan bases de listas fijas. Verifican etiquetas,
  puertos loopback, rol, ID de contenedores, system_identifier, huella del manifiesto
  y de los respaldos. No reciben coordenadas de bases habituales.
- Salida obligatoria fuera del repositorio: **/tmp/hexacore-consolidacion/**
  (/private/tmp en macOS), directorio 0700 y archivos 0600. Rechaza enlaces dentro
  de la ruta. Contiene datos, hashes y tokens: no subirla a Git, CI artifacts ni PR.
  Los dumps/RDB y salida/ también están ignorados como segunda barrera.

## Reproducción desde la raíz del repositorio

Reservar los puertos y usar exclusivamente esos proyectos. No ejecutar iniciar.sh,
semillas, prehooks de truncado ni comandos contra el PostgreSQL habitual.
Las tareas siguientes son secuenciales:

```bash
cd App/backend
nvm install
nvm use
npm ci
npm run lint
npm run build
npm run test:imagen:infra
npm run ensayo:datos:infra
npm run test:pagos:convivencia        # 5 pruebas existentes; conserva fixtures propias
npm run ensayo:datos -- preparar --salida=/tmp/hexacore-consolidacion/referencia-01
npm run ensayo:datos -- capturar --salida=/tmp/hexacore-consolidacion/referencia-01
ENSAYO_SALIDA=/tmp/hexacore-consolidacion/referencia-01 npm run ensayo:datos:verificar
```

Preparar necesita el Núcleo compilado en el host para cifrar contraseñas con su
implementación existente. Inserta únicamente credenciales iniciales y referencias
de menú/evento/localidad/promoción que carecen de administración completa. Usa
login real y APIs actuales para auditoría, compra de alimentos, aprobación/rechazo/
incertidumbre, pendientes, promoción, cancelación/reembolso, reventa, transferencia,
ingreso, asignación, solicitud/revisión de turno y asistencia. **46 comprobaciones**
HTTP/proyecciones en una preparación completa; no envía correos reales.
La cuenta pendiente usa registro real; su correo queda durable en RabbitMQ.
Los intentos fallidos de preparación conservan sus datos y evidencia. No se repite
silenciosamente un directorio con preparacion-iniciada.json; usar otro y documentar
su contribución al conjunto, o comenzar otro ensayo aislado completo.

Capturar detiene solo gateway/Núcleo/Boletería/pasarela de ese proyecto. No hay
Trabajador activo en su broker, para conservar el correo pendiente. Rechaza otras
conexiones SQL de cliente, transacciones preparadas y conexiones/consumidores AMQP.
Activa default_transaction_read_only **solo en las ocho bases de prueba**. Compara
catálogos, secuencias y contenido antes/después de cada dump y otra vez tras los ocho.

La coherencia del corte procede de **inmovilizar los escritores de todas las bases**,
no de ejecutar varios pg_dump. Los ocho dumps se realizan secuencialmente dentro
de ese intervalo sin escritores; no son una instantánea MVCC global. Autovacuum
puede seguir trabajando sin alterar filas lógicas. Si se detecta otra sesión o
cambio, no se genera una referencia aceptada. Esto ensaya una parada controlada,
sin certificar migración online ni RNF-15. Los superusuarios de prueba podrían
anular read_only: no ejecutar otros procesos sobre estos recursos durante el corte.

Redis: SCAN/tipo/PTTL/DUMP SHA-256 y RDB propio, sin FLUSH ni liberación de reservas.
El inventario tiene hora del servidor; TTL sigue transcurriendo, **no es simultáneo
con SQL**. RabbitMQ: exchanges/bindings/colas/DLQ/argumentos y conteos actuales
checkQueue, cero consumidores. No se extraen/reencolan/purgan mensajes. El inventario
RabbitMQ **no es un respaldo de mensajes**; el broker y su volumen se conservan.

## Transferencia, restauración y repetición

La batería verifica guardas y respaldo alterado; restaura originales en
**restauracion_<esquema>**, con public e historiales originales. Crea otras ocho
**preparacion_<esquema>**, mueve allí extensiones y renombra public. No modifica
el origen. Los catálogos de ambas copias se concilian contra la referencia.
Después carga los ocho esquemas en **hexacore** con psql -X --single-transaction y
ON_ERROR_STOP. No sustituye nombres dentro de los datos/SQL mediante reemplazos.
Dos funciones de negocio revisadas solo rechazan cambios al historial/auditoría;
funciones nuevas o referencias public residuales requieren revisión explícita.

La ACL inicial de public que pg_dump omite al renombrarlo se reproduce explícitamente
(propietario pg_database_owner, USAGE de PUBLIC); una ACL diferente se rechaza antes
de transferir. Se preservan propietarios/permisos/comentarios de esquemas, propietarios
de objetos, definiciones, fechas, UUID, hashes, numeric sin conversión a Number,
secuencias/last_value/is_called, FK/check/unique, funciones/triggers e historiales.
Se compara SHA-256 del texto completo de cada fila generado en PostgreSQL, orden C,
incluyendo multiplicidad. El comparador solo equipara la distribución de casts
varchar[]→text[] en CHECK de literales y la cualificación de la llamada nativa
gen_random_uuid; comprueba que el DEFAULT no apunte al homónimo de una extensión.

La carga termina primero en **TRANSFERIDO**; solo después de conciliar pasa a
**CONCILIADO** y escribe conciliacion.json. Error o pérdida de conexión a mitad
de psql revierte los ocho esquemas/control. Las marcas de DB vinculan las copias
con la huella: un destino ajeno se rechaza. Nunca se borran tablas para hacer coincidir
conteos. Una restauración interrumpida se rechaza; --reanudar restaura solo una copia
identificada vacía, no una mezcla parcial. Si preparación_ quedó interrumpida,
inspeccionar su marca/catálogos y repetir únicamente esa copia en un ensayo nuevo;
el procedimiento falla cerrado y no promete reanudación arbitraria de DDL parcial.

Operaciones individuales, con la misma --salida:

```bash
npm run ensayo:datos -- restaurar --salida=/tmp/hexacore-consolidacion/referencia-01
# En un destino nuevo, sin ejecutar primero la batería destructiva:
npm run ensayo:datos -- transferir --salida=/tmp/hexacore-consolidacion/referencia-01
# Si la carga atómica se interrumpió y hexacore está vacío e identificado:
npm run ensayo:datos -- transferir --reanudar --salida=/tmp/hexacore-consolidacion/referencia-01
# Si ya quedó cargado: concilia, sin duplicar ni escribir registros de negocio.
npm run ensayo:datos -- transferir --verificar-existente --salida=/tmp/hexacore-consolidacion/referencia-01
npm run ensayo:datos -- conciliar --salida=/tmp/hexacore-consolidacion/referencia-01
```

La batería provoca división por cero y terminación **de su propia conexión**
después de tres esquemas; exige salida no cero y destino vacío en ambos casos.
Reanuda, verifica destino existente/repetición, clona **verificacion_hexacore** y
comprueba las 16 secuencias mediante nextval y máximos de seriales. Sus inserciones
propias prueban FK/PK/check y los dos triggers inmutables. nextval no se revierte
con ROLLBACK: por eso se hace en esa copia, nunca en origen ni hexacore conciliado.
Al final repite la conciliación de destino y las ocho restauraciones.

Para repetir **toda la batería de fallos** sobre los mismos recursos, eliminar
explícitamente solo sus dos destinos de prueba identificados (no toca origen,
respaldos ni restauracion_/preparacion_):

```bash
npm run ensayo:datos -- reiniciar-destino-pruebas --salida=/tmp/hexacore-consolidacion/referencia-01
ENSAYO_SALIDA=/tmp/hexacore-consolidacion/referencia-01 npm run ensayo:datos:verificar
```

Las herramientas usan buffers de hasta 64 MiB; esta entrega certifica fixtures
de ensayo, no dimensionamiento para datos reales. Un respaldo mayor falla;
no se acepta una copia truncada. La adaptación operativa posterior debe dimensionar
disco/memoria/tiempos, roles y grants específicos de la instalación.

## Resultado observado y paso siguiente

Ver **ESTADO-MIGRACION §22** para resultados y fallos de preparación realmente
ejecutados. Las diferencias previas se registran antes y después, no se corrigen.
En particular un libro APROBADO con pedido/transacción sin finalizar acredita F12,
no una diferencia de transferencia. Compartir base conserva las ventanas actuales.

Cambio previsto: respaldar una instalación autorizada; parar escritores/consumidores
y callbacks, verificar fin de transacciones/outbox, inventariar reservas y mensajes;
definir con sus responsables qué pendientes se drenan y cómo se conserva el broker/
Redis sin perder TTL/revocaciones. No borrar pendientes ni resolver pagos inciertos
por suposición. Aplicar la transferencia sobre copia conciliada, adaptar conexiones
nombradas/esquemas, SQL de secuencias/consultas e historiales y arranque único de
migraciones; ejecutar regresiones antes de habilitar nuevas escrituras/tráfico.

Reversión antes de escrituras nuevas: conservar las ocho bases inmóviles y snapshots
de configuración, volver a destinos/versiones anteriores de forma coordinada con
Redis/broker. Con escrituras nuevas en hexacore, volver a una imagen antigua **no
revierte los datos**: requiere pausa y estrategia de copia inversa/conciliación
autorizada. Aquí se probó restaurar los ocho dumps originales, no una migración
inversa desde datos modificados después del cambio. No se ensayó activar aplicaciones
contra hexacore; es la siguiente entrega.

Para conservar evidencia y mensajes al cerrar, **parar, sin borrar volúmenes**:

```bash
docker compose -p hexacore-consolidacion-e2e -f test/consolidacion/docker-compose.yml stop
docker compose -p hexacore-backend-e2e -f test/docker-compose.e2e.yml -f test/docker-compose.imagen.yml stop
```

No reiniciar las aplicaciones de origen después de capturar: siguen en modo de solo
lectura. No hay limpieza automática. Una futura eliminación explícita debe limitarse
a esos proyectos y a la referencia privada que ya no se necesite, tras inspeccionar
los IDs/marcas; el inventario no habilita borrar reservas ni mensajes del entorno habitual.
