# Alternar Redash y HEXACORE en este Mac

Estado comprobado el **11 de noviembre de 2026, 21:40 UTC**: siete contenedores
Redash activos, `/ping` y `/login` responden 200; `hexacore-cu015-sebastian`
detenido mediante su script, con datos y volúmenes conservados. No se repitió
la aceptación: los **13/13 automático y 13/13 visible** corresponden a la
condición anterior con Redash detenido. CU-028 sigue pendiente de Samuel.

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

Esperar a PostgreSQL listo y Redis `PONG`. Después reanudar las aplicaciones
que estaban activas antes de alternar; en esta instalación son estas cinco:

```bash
docker compose --project-name redash -f compose.yaml start server scheduled_worker scheduler adhoc_worker worker
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:5001/ping
curl --fail --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:5001/login
```

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
demo privada habitual, sin mostrar claves. **No arrancar `preparacion-base`**
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

La recuperación de esta entrega se logró **sin reinicios manuales de Redash**.
Después de parar CU-015 se observaron unos cuatro minutos sin nuevos OOM o
reinicios, con HTTP correcto; no es una garantía de disponibilidad sostenida.
Diagnóstico y mediciones exactas:
[PLAN-CIERRE-SEBASTIAN.md](PLAN-CIERRE-SEBASTIAN.md).
