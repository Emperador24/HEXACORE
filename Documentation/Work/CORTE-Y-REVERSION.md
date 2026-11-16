# Corte y reversión del entorno habitual — procedimiento revisado, NO ejecutado

Esta guía es un procedimiento operativo propuesto para una ventana autorizada.
La entrega actual **no lo ejecuta**. Los scripts ensayo:datos y base-unica tienen
guardas exclusivas de pruebas: no quitar sus guardas ni apuntarlos al PostgreSQL
habitual. El código ya está integrado en develop (PR #44); integrar no ejecuta este corte.

## Condiciones para iniciar la ventana

1. Fijar revisión destino y ocho digests verificados del mismo commit; revisión
   anterior **realmente instalada**, imágenes/configuración previas y responsables.
   Una etiqueta mutable o volver a la imagen anterior no constituye reversión.
2. Confirmar que la instalación que se va a cortar corresponde al inventario de
   ocho bases/historiales de la tabla siguiente. Inventariar objetos, propietarios,
   ACL, versiones/extensiones, collation y todas las fuentes de migración. Si no
   coincide con las 18 fuentes conocidas, **detener el procedimiento** y diseñar
   explícitamente esa transición; los fixtures A/B no demuestran esa equivalencia.
3. Definir entrada de mantenimiento fuera de los procesos y quién retiene/reintenta
   callbacks. Detener un simulador en pruebas no demuestra que un proveedor real
   retenga webhooks: acordar su política antes de cerrar el receptor.
4. Fijar tratamiento de pendientes con cada dueño: outbox sin publicar, correos,
   turnos, reservas/TTL y pagos inciertos. No purgar/resembrar para conseguir cero.
   F12/F15 no ofrecen recuperación/deduplicación durable nueva. Si no puede
   garantizarse la conservación del pendiente, no abrir tráfico en la versión nueva.
5. Espacio/capacidad para respaldos, restauraciones y destino; permisos; ensayo
   restaurado y conciliado, responsables presentes y ventana de indisponibilidad
   acordada. No se declara RNF-15 de despliegue sin parada.

| Origen habitual a verificar | Esquema destino | Historial / entradas |
|---|---|---|
| administracion | identidad | migraciones / 3 |
| pedidos | alimentos | migraciones / 2 |
| eventos_emergencias | personal_logistica | migraciones / 2 |
| entradas_mercado_secundario | entradas_ventas | migraciones / 5 |
| catalogo | entradas_catalogo | migraciones / 1 |
| postventa | entradas_postventa | migrations / 1 |
| acceso_qr | entradas_acceso_qr | migraciones / 3 |
| pagos | finanzas_pagos | migraciones / 1 |

## 1. Capturar la versión y cerrar escritores

Los comandos siguientes son plantillas concretas **para la ventana**, revisadas
contra Docker/PostgreSQL 16 y la transferencia ensayada. Ejecutar desde una shell
con `set -euo pipefail`, Node 22.22.3 y un directorio privado nuevo fuera de Git:

```bash
set -euo pipefail
CORTE_DIR=/ruta/privada/corte-AAAA-MM-DD
(umask 077; mkdir "$CORTE_DIR")
chmod 700 "$CORTE_DIR"
git rev-parse HEAD > "$CORTE_DIR/revision-destino.txt"
docker ps -a --no-trunc > "$CORTE_DIR/contenedores-antes.txt"
docker inspect hexacore-postgres > "$CORTE_DIR/postgres-config-privada.json"
# Guardar privadamente también inspect de TODOS los procesos actuales y sus imágenes.
# Sus variables pueden contener secretos: no subir a Git, PR ni artifacts.
```

Identificar procesos por etiquetas/IDs y la configuración **anterior instalada**:
no inferirlos por la lista de servicios del Compose nuevo. Conservar su checkout/
Compose, env, imágenes exportadas o digests descargables y parámetros de escalado.
Registrar `docker image inspect`/RepoDigests y guardar las imágenes locales sin
registro con `docker image save -o "$CORTE_DIR/imagenes-previas.tar" <IDs revisados>`.
No usar el checkout actualizado para arrancar servidores retirados.

Activar mantenimiento y pausar productores/callbacks antes de detener apps.
Con **los IDs previamente revisados**, sin incluir PostgreSQL/Redis/RabbitMQ:

```bash
# Sustituir por la lista literal aprobada de escritores/consumidores actuales.
docker stop --time 30 '<ID-gateway>' '<IDs-backend>' '<ID-consumidor-antiguo>'
# Parar también procesos Node externos, cron o integraciones que escriban.
# No matar tareas en vuelo sin registrar su resultado; verificar SIGTERM/logs.
docker exec hexacore-postgres psql -X -U hexacore -d postgres -v ON_ERROR_STOP=1 -c \
"SELECT pid,datname,application_name,state,xact_start,pg_blocking_pids(pid)
 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid();"
docker exec hexacore-postgres psql -X -U hexacore -d postgres -v ON_ERROR_STOP=1 -c \
"SELECT gid,database,prepared FROM pg_prepared_xacts;"
```

Exigir cero escritores/conexiones a las ocho bases y cero transacciones preparadas;
si hay una, identificarla y resolver operativamente, **sin pg_terminate automático**.
Inventariar colas ready/unacked, consumidores, bindings/DLQ y outbox con conteos
por sus dueños. El inventario AMQP no respalda cuerpos de mensajes. Conservar broker,
volumen y nodo; no activar simultáneamente correo antiguo y Trabajador nuevo.
Inventariar Redis con tipo/PTTL/huella y copia consistente según su persistencia;
conservar volumen. TTL continúa transcurriendo: no prolongarlo ni restaurar un RDB
viejo encima de una instancia que ya recibió operaciones nuevas.

Solo después de drenar/parar los escritores de toda la instalación:

```bash
for CORTE_BD in administracion pedidos eventos_emergencias entradas_mercado_secundario catalogo postventa acceso_qr pagos; do
  docker exec hexacore-postgres psql -X -U hexacore -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE \"$CORTE_BD\" SET default_transaction_read_only=on;"
done
```

Ese ajuste afecta conexiones nuevas; no sustituye verificar las ya existentes.
El intervalo común sin escritores aporta coherencia entre bases; ocho pg_dump
independientes **no** son una instantánea MVCC global ni un corte atómico con el
broker, Redis y la pasarela. Registrar horas/cuentas pendientes e impedir nuevos
escritores/callbacks hasta la decisión de apertura.

## 2. Respaldar y restaurar antes de transferir

```bash
umask 077
docker exec hexacore-postgres pg_dumpall -U hexacore --globals-only > "$CORTE_DIR/globales-privados.sql"
for CORTE_BD in administracion pedidos eventos_emergencias entradas_mercado_secundario catalogo postventa acceso_qr pagos; do
  test ! -e "$CORTE_DIR/$CORTE_BD.dump"
  docker exec hexacore-postgres pg_dump -U hexacore -d "$CORTE_BD" -Fc > "$CORTE_DIR/$CORTE_BD.dump"
  test -s "$CORTE_DIR/$CORTE_BD.dump"
  shasum -a 256 "$CORTE_DIR/$CORTE_BD.dump" >> "$CORTE_DIR/respaldos.sha256"
done
shasum -a 256 -c "$CORTE_DIR/respaldos.sha256"
```

Comparar inventario/contenido antes y después de cada respaldo y al finalizar todos,
como el ensayo de §22. No aceptar un fichero parcial por existir o tener tamaño.
Validar versión, encoding/collation, propietarios, ACL, extensiones y dumps con
restauración completa **en otro servidor**, sin apps ni acceso al tráfico.

Ejemplo de preparación del servidor de copia, solo tras inspeccionar que nombre,
puerto 15441 y volumen no existen; usar digest PostgreSQL validado y secreto propio:

```bash
CORTE_POSTGRES_IMAGEN='postgres@sha256:REEMPLAZAR_POR_DIGEST_VALIDADO'
# Crear fuera de Git $CORTE_DIR/postgres.env, modo 0600, con POSTGRES_USER=hexacore,
# POSTGRES_PASSWORD=<secreto propio> y POSTGRES_DB=postgres. No copiar secretos al terminal.
docker volume create --label hexacore.uso=corte-verificacion hexacore-corte-verificacion-pg
docker run -d --name hexacore-corte-verificacion-pg \
  --label hexacore.uso=corte-verificacion \
  --env-file "$CORTE_DIR/postgres.env" \
  -p 127.0.0.1:15441:5432 \
  -v hexacore-corte-verificacion-pg:/var/lib/postgresql/data "$CORTE_POSTGRES_IMAGEN"
# Esperar pg_isready; comprobar inspect/etiqueta/volumen antes de cada operación.
for CORTE_BD in administracion pedidos eventos_emergencias entradas_mercado_secundario catalogo postventa acceso_qr pagos; do
  docker exec hexacore-corte-verificacion-pg createdb -U hexacore -T template0 "restauracion_$CORTE_BD"
  docker exec -i hexacore-corte-verificacion-pg pg_restore -U hexacore \
    -d "restauracion_$CORTE_BD" --single-transaction --exit-on-error < "$CORTE_DIR/$CORTE_BD.dump"
done
```

No restaurar globales indiscriminadamente: revisar roles/propietarios de la copia.
Conciliar tablas/filas completas, importes numeric por moneda/estado, referencias,
propietarios/QR, auditoría, secuencias, funciones/triggers y ocho historiales.
Se puede reutilizar **solo el comparador puro** inventario/comparar de
App/backend/test/consolidacion/catalogo.cjs con clientes explícitos revisados;
no usar las guardas ni conectores de ensayo.cjs sobre el entorno habitual.
No trasladar discrepancias anteriores como si fueran errores de transferencia.

## 3. Transformar únicamente copias y preparar el destino

En otras ocho bases `preparacion_<esquema>` del servidor de copia, restaurar otra vez
cada dump, con template0 y pg_restore atómico, sin borrar public antes de restaurar.
Después, **en esas copias** y en transacción:

```sql
BEGIN;
CREATE SCHEMA extensiones;
-- Ejecutar solo para las extensiones presentes, con versión/propietario y
-- extrelocatable comprobados. No asumir que todas están en cada origen.
ALTER EXTENSION "uuid-ossp" SET SCHEMA extensiones;
ALTER EXTENSION pgcrypto SET SCHEMA extensiones;
ALTER SCHEMA public RENAME TO identidad; -- ejemplo: usar el mapa de ocho esquemas
COMMIT;
```

Repetir con el esquema correcto en cada base de preparación; conservar IDs, historial
y secuencias. Revisar cuerpos de funciones/triggers y SQL public residual; un reemplazo
textual global sobre dumps/filas no es una migración válida. Exportar cada esquema:

```bash
docker exec hexacore-corte-verificacion-pg pg_dump -U hexacore \
  -d preparacion_identidad --schema=identidad > "$CORTE_DIR/identidad.sql"
# Igual para los otros siete, con base/esquema explícitos del mapa.
```

Crear **un destino hexacore nuevo, vacío e identificado**, no una base existente de
nombre coincidente. Construir transferencia.sql revisado a partir de esos ocho SQL:
crear extensiones compartidas una vez en extensiones (uuid-ossp 1.1/pgcrypto 1.3
para la referencia validada); cargar ocho esquemas; preservar la ACL constatada.
El ensayo preserva propietario pg_database_owner y USAGE a PUBLIC; cualquier ACL
real distinta exige adaptación explícita, no imponer esa ACL por suposición.
Crear migracion_control.procedencia con las 18 rutas/SHA/nombres originales de
compartido/persistencia/historia.ts y **origen habitual del mapa**, no instalacion-vacia.
La forma y generación se conservan en ensayo.cjs/transferir como referencia revisada.
No copiar marcas/huellas de fixtures del ensayo como certificado de datos habituales.

```bash
# CORTE_DESTINO: contenedor nuevo revisado; no hexacore-postgres original.
docker exec "$CORTE_DESTINO" createdb -U hexacore -T template0 hexacore
docker exec -i "$CORTE_DESTINO" psql -X -U hexacore -d hexacore \
  --single-transaction -v ON_ERROR_STOP=1 < "$CORTE_DIR/transferencia.sql"
```

Conciliar nuevamente estructura/filas/secuencias/historiales contra cada origen.
Probar nextval/restricciones **en otra copia de verificación**: nextval no revierte
con rollback. Ante interrupción/estado parcial, no reanudar a ciegas: comprobar marca,
esquemas y transacción completa revertida. Nunca truncar ni usar IF EXISTS para aceptar
un destino ajeno. Repetición de un destino ya completo solo concilia, no inserta otra vez.

La transferencia habitual automatizada aún **no está habilitada**: antes de la ventana
se debe producir y revisar transferencia.sql y el manifiesto real, con roles/ACL y
objetos del sitio. Las herramientas de prueba no autorizan ese salto. Este es un
bloqueo operativo explícito del corte, no una aplicación ya migrada en producción.

## 4. Preparación y validación antes de abrir

Cambiar únicamente la configuración de la versión nueva al destino conciliado;
conservar las ocho bases anteriores inmóviles. Mismas POSTGRES_* en ambos programas,
POSTGRES_BD=hexacore, ninguna variable antigua. El entorno/secretos se guardan fuera
de Git. Ejecutar una vez con la **imagen Núcleo del digest fijado**, misma red/destino:

```bash
# Compose/configuración de destino revisada; sin tráfico y sin consumidores antiguos.
docker compose -f App/infra/docker-compose.yml -f App/infra/docker-compose.registro.yml \
  --profile servicios run --rm --no-deps preparacion-base
# Exigir salida 0, ocho historiales reconocidos y cero reaplicaciones de las 18.
# Arrancar después ambas apps, Trabajador y gateway de la versión nueva.
```

**No usar ese Compose sin adaptarlo al destino**: sus coordenadas por defecto apuntan
al entorno habitual local. Inspeccionar config resuelta, nombre de proyecto, volúmenes,
puertos y digests antes de run/up. Retirar consumidores antiguos antes de arrancar
Trabajador; validar canales/colas existentes, outbox, reservas y revocaciones sin purgas.
Aplicaciones no ejecutan migraciones desde Dockerfiles o bootstrap.

Antes de abrir: lectura real conservada por módulo; salud/historiales; pg_stat_activity
solo destino común; ambos pools finanzas-pagos al mismo libro; un webhook HMAC en Núcleo;
JWT pública en Boletería, ninguna clave/SQL en Trabajador; rutas del gateway;
operaciones nuevas de aceptación con UUID propios, publicación/recepción y SIGTERM.
Registrar deltas esperados (login, vencimientos reales), sin reemplazar datos con semillas.
Las pruebas A/B y de imágenes son referencia, no sustituyen esta aceptación del sitio.

Abrir tráfico y callbacks de forma coordinada, una sola versión escritora. Registrar
hora, pendientes, digests/configuración y responsables. Observar F13 y F15; no subir
límites ni atribuir a compartir base recuperación F12, QR inmediato o entrega única.

## 5. Reversión

**Antes de nuevas escrituras:** cerrar cualquier proceso nuevo, mantener tráfico/callbacks
pausados; comprobar cero conexiones/transacciones. Volver a la configuración y las imágenes
previas **realmente conservadas**, con sus bases y broker/Redis correspondientes. Retirar
read_only de las ocho bases solo en ese punto y con escritores nuevos detenidos:

```bash
for CORTE_BD in administracion pedidos eventos_emergencias entradas_mercado_secundario catalogo postventa acceso_qr pagos; do
  docker exec hexacore-postgres psql -X -U hexacore -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER DATABASE \"$CORTE_BD\" RESET default_transaction_read_only;"
done
# Abrir conexiones nuevas de la versión anterior; comprobar salud/pendientes antes de tráfico.
```

Antes de dar read_only por levantado, restaurar el valor original registrado, que puede
haber sido on en alguna base por otra razón; RESET solo corresponde al valor por defecto
constatado en el preflight. No asumir que terminar un contenedor vacía sus mensajes.

**Después de nuevas escrituras, envíos o callbacks:** nueva pausa global y respaldo de
hexacore/broker/Redis; inventariar movimientos, referencias, propietarios, QR y entregas
posteriores al corte. La estrategia de copia inversa/conciliación con las ocho bases
necesita diseño y autorización por sus dueños; no está implementada/ensayada aquí.
No sobrescribir originales con dumps viejos ni devolver dinero por deducción. Puede
ser más seguro corregir hacia delante. **Volver de imagen no revierte datos ni efectos
externos**, y reentregar correos puede duplicarlos por F15.

## Cierre de la ventana futura

Guardar evidencia privada de conciliación/aceptación, responsables y decisión de apertura;
retener respaldos/originales el período acordado. Sin down -v ni eliminación automática.
Estado actual: procedimiento revisado, transferencia/corte habitual y reversión de
escrituras nuevas pendientes. Ningún comando de esta guía se ejecutó sobre el sitio.
