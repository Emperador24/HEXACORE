# Alternar Redash y HEXACORE en este Mac


**Última ventana — 13/11, autorización/DAST:** motor apagado al inicio y al final.
CU-015/ZAP detenidos por scripts; siete IDs/imágenes/montajes Redash restaurados
una vez, PG listo/Redis PONG, últimos `/ping` y `/login` **200**, siete cgroups
sin oom_kill nuevos. Hubo resets/timeout en arranque, sin reinicios repetidos.
El 200 corresponde al control previo a apagar Docker, no disponibilidad actual.
Imágenes backend actualizadas solo por brechas demostradas (545e19c/9a06ba8);
portales/CSP conservados. Scheduler volvió a cerrar 137/OOM=false al detenerlo,
registrado sin ampliar investigación. [Resultado](../../App/infra/informe-atributos/seguridad/RESULTADO.md).


**13/11/2026, bloque Angular/CSP:** Docker Desktop estaba apagado al inicio y se
restauró **apagado** al terminar. Antes de apagarlo: CU-015 y ZAP detenidos por
scripts; siete IDs/imágenes/montajes Redash originales restaurados una sola vez,
PG listo/Redis PONG, controles finales `/ping` y `/login` **200**, cgroups sin
nuevos oom_kill. Hubo resets/timeout de arranque y se conservan; no hubo ciclos
de reinicios. Al estar el motor apagado, no se afirma Redash accesible ahora.
Para otra sesión, iniciar Docker Desktop existente y volver a registrar/alternar
según estas instrucciones; no asumir estados a partir de este informe.

Imágenes actuales propias: Angular 22.2.6/CSP efectiva (4487b16), Node frontend
22.22.3. Aceptación con imágenes nuevas y Redash detenido: **16/16 automático y
16/16 visible**, un trabajador/cero reintentos/límites normales. Primera pasada
15/16 por img-src blob de CU-029, corregida; historial y residuos de Seguridad en
[RESULTADO.md](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

Los registros inferiores se conservan como historia; no describen el motor
actual apagado.

**Estado posterior a Seguridad, 12/11/2026 11:36 UTC:** siete IDs Redash
originales activos, CU-015 y ZAP detenidos; montajes/datos conservados. Tras el
arranque por etapas hubo 200 en `/ping` y `/login`, pero el último control agotó
10 s en ambos. Cgroups del último arranque: server 2 / scheduled_worker 1
`oom_kill`, incidentes nuevos; no confundirlos con las marcas históricas de abajo.
No se hicieron reinicios de recuperación. Estados restaurados; acceso HTTP
bloqueado al último control. Requiere capacidad autorizada/revisión de concurrencia
Redash y verificación HTTP; no detener otros proyectos ni cambiar recursos globales.
La ventana adicional solo leyó PostgreSQL propio para corregir cobertura del arnés
RNF-05; no repitió recorridos funcionales ni diagnóstico SIGTERM. Detalles en
[RESULTADO.md](../../App/infra/informe-atributos/seguridad/RESULTADO.md).


**Comprobación posterior, 12/11 a las 01:50 UTC:** `/ping` y `/login` volvieron
a responder 200, con los siete IDs iniciales Redash activos y CU-015 detenido.
No se hicieron más reinicios después del único escalonado. Se deja Redash
accesible; la sonda no elimina los OOM del arranque ni certifica estabilidad
continua. El diagnóstico de las 00:55 se conserva como condición intermedia.

Estado posterior a CU-011F, **12 de noviembre de 2026, 00:55 UTC** (11/11 en
Bogotá): siete contenedores Redash activos; `hexacore-cu015-sebastian` detenido
mediante su script, con datos y volúmenes conservados. **Redash HTTP pendiente**:
PostgreSQL listo y Redis PONG, pero `/ping` y `/login` agotan 5 s y hay OOM nuevos
con CU-015 detenido. Un único arranque escalonado logró HTTP 200 hasta incorporar
el último worker; no se repiten reinicios ni se afirma disponibilidad por estar
`running`. El responsable debe liberar capacidad autorizada o revisar concurrencia
de Redash y comprobar HTTP; no intervenir otros proyectos con esta guía.

Aceptación CU-011F actual con Redash detenido: **16/16 automático y 16/16 visible**,
tests c3d3386, límites normales, cero reintentos. Conserva la referencia histórica
13/13. Esquema actual **35 migraciones, 18 procedencias históricas intactas**;
no volver a preparar o sembrar para reanudar los mismos contenedores. CU-028 sigue
pendiente de Samuel. Las ventanas y fallos anteriores están en el plan.

Con el presupuesto actual de Docker, usar un proyecto cada vez. Estos pasos
reanudan **los contenedores existentes**; no construyen ni descargan imágenes,
no ejecutan preparación/semillas y no cambian contraseñas. Conservar también
las carpetas privadas de estado y configuración. No usar `down`, `rm`, `prune`,
`pause` ni borrar volúmenes. No intervenir otros proyectos.

## De HEXACORE a Redash

Desde el repositorio, en `feature/sebastian`:

```bash
cd /Users/sebastiansanchez/Documents/HEXACORE
./App/infra/cu015.sh parar
./App/infra/cu015.sh estado
```

Continuar solo si la parada termina correctamente y el proyecto queda sin
servicios activos. El script valida rama, proyecto, checkout, recursos y cierre;
0/143 son los códigos previstos de las aplicaciones Nest, sin OOM/SIGKILL.

En Redash, con su configuración local existente, arrancar primero proveedores
si estaban detenidos:

```bash
cd /Users/sebastiansanchez/lab03/redash
docker compose --project-name redash -f compose.yaml start postgres redis
docker exec redash-postgres-1 sh -c 'pg_isready -q -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}"'
docker exec redash-redis-1 redis-cli PING
```

Esperar a PostgreSQL listo y Redis `PONG`. Reanudar solo aplicaciones que estaban
activas antes de alternar; en esta instalación son cinco. Incorporarlas una a
una, comprobando `/ping` y `/login` antes de continuar:

```bash
docker compose --project-name redash -f compose.yaml start server
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:5001/ping
curl --fail --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:5001/login
```

Si responde, incorporar `scheduler`, `worker`, `adhoc_worker` y `scheduled_worker`
con `docker compose --project-name redash -f compose.yaml start SERVICIO`,
comprobando salud HTTP y nuevos OOM después de cada uno. No automatizar un ciclo
de reinicios ante fallo. El 12/11 el servidor respondió 200 hasta la incorporación
del último worker y después volvió a agotar el plazo con memoria/swap escasos.
Se restauraron los siete estados iniciales, pero su disponibilidad quedó bloqueada.

Comprobar también el acceso en el navegador:
[http://127.0.0.1:5001/login](http://127.0.0.1:5001/login).
Si Redash ya está activo y responde, no necesita reiniciarse. No arrancar
servicios adicionales que estuvieran detenidos antes de la alternancia.

## De Redash a los mismos contenedores de HEXACORE

Antes de detener Redash, registrar los contenedores activos mediante sus
etiquetas; no mostrar `docker inspect` completo ni configuración/variables:

```bash
docker ps -a --filter label=com.docker.compose.project=redash --format '{{.ID}} {{.Label "com.docker.compose.service"}} {{.Status}}'
```

Desde `/Users/sebastiansanchez/lab03/redash`, detener primero las aplicaciones
activas y, una vez cerradas, sus proveedores:

```bash
docker compose --project-name redash -f compose.yaml stop --timeout 120 server scheduled_worker scheduler adhoc_worker worker
docker compose --project-name redash -f compose.yaml stop --timeout 120 postgres redis
```

Comprobar los estados y códigos de cierre. **137 no acredita cierre ordenado**:
el scheduler agotó antes una gracia de 60 s cuando había presión de memoria.
Si un servicio vuelve a cerrar con 137 o hay otro error, conservar logs y
diagnosticarlo antes de continuar; no repetir reinicios ni tratarlo como normal.
En la próxima restauración, arrancar únicamente los servicios que estaban
activos en el registro inicial.

Para reanudar **estos mismos once contenedores CU-015**, sin reconstrucción ni
preparación, volver al repo y pasar primero sus guardas de inventario:

```bash
cd /Users/sebastiansanchez/Documents/HEXACORE
./App/infra/cu015.sh estado
docker start hexacore-cu015-sebastian-{postgres,redis,rabbitmq,correo,pasarela}-1
docker ps --filter label=com.docker.compose.project=hexacore-cu015-sebastian --format '{{.Names}} {{.Status}}'
```

Esperar a que los cinco proveedores estén `healthy`; después:

```bash
docker start hexacore-cu015-sebastian-{nucleo,boleteria,trabajador,api-gateway,portal-web-cliente,portal-web-admin}-1
./App/infra/cu015.sh estado
```

Comprobar once servicios saludables y salud HTTP/login con la configuración
demo privada habitual, sin mostrar claves. Tras reiniciar Núcleo, comprobar
también **la ruta pública `/api/v1/salud` del gateway**: salud interna no demuestra
que haya terminado su resolución DNS. No comenzar el negocio si falla esta
precondición ni reintentar pagos para ocultarla. **No arrancar `preparacion-base`**
para una simple reanudación del entorno ya preparado. Estas instrucciones
requieren los mismos contenedores, configuración, esquema e imágenes actuales;
si falta alguno, cambian fuentes o hay puertos ocupados, detenerse y revisar el
arranque con guardas en una entrega separada. No ejecutar `cu015.sh iniciar`
como sustituto de esta reanudación: actualmente compila por defecto. Tampoco
usar `--datos-demo` para recuperar un entorno ya sembrado.

## Revisar OOM sin confundir historia con un incidente nuevo

Una marca `State.OOMKilled=true` puede persistir mientras el contenedor está
activo. Comparar eventos Docker, horas de logs y contadores cgroup `oom_kill`
entre dos momentos. Un reinicio recrea el cgroup y puede devolver sus contadores
a cero; conservar también el evento anterior y el contador de reinicios.

La recuperación histórica de las 21:40 UTC logró HTTP 200 sin reinicios manuales.
En la restauración posterior a CU-011F hubo **OOM nuevos** con CU-015 detenido;
server pasó de 4 a 8 `oom_kill` en el mismo cgroup entre las 00:49 y 00:55 UTC.
El único escalonado reinició cuatro servicios de aplicación, no proveedores,
sin cambiar imágenes, configuración o volúmenes. Dejar siete `running` no resolvió
la falta de capacidad; no se amplió esa intervención.
Diagnóstico y mediciones exactas:
[PLAN-CIERRE-SEBASTIAN.md](PLAN-CIERRE-SEBASTIAN.md).

## Ver CU-011F tras alternar a HEXACORE

Con los once servicios saludables, login demo disponible y Redash detenido:

```bash
CU015_DEMO_MS=2000 npm --prefix App/e2e run demo -- cu011f --grep 'por interfaces'
```

Muestra compra, cancelación por Personal con motivo/confirmación, recuperación
de respuesta perdida, reembolso confirmado y aviso al cliente sin QR utilizable.
Usa cuentas y proveedores simulados existentes, más fixtures propias; no cambia
claves ni resiembra. Los informes DEMO privados no sustituyen la aceptación normal.
