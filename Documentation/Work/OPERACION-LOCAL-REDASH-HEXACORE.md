# Alternar Redash y HEXACORE en este Mac

**16/11 — Seguridad/Safety monetario/Modificabilidad:** Docker activo, motor
2912 MiB y 41 contenedores activos al consultar; inventario privado conservado. Se ejecutan
pruebas de herramientas/tipos/audit sin crear o detener recursos ni abrir/cerrar
Docker Desktop. No se detiene Redash ni se intenta liberar capacidad. El ensayo
nuevo corre en Actions con proyecto exclusivo y guardas de memoria/disco/puertos.
No se opera ZeroTier/A/B. Las alternancias históricas inferiores no autorizan
paradas para esta entrega. [Guion y resultados](PLAN-CIERRE-SEBASTIAN.md).


**Reparto real confirmado — este Mac es C:** solo navegador y registrador. A es
el Mac de Samuel y B una VM Javeriana. No aplicar aquí los procedimientos de
arranque/parada/alternancia históricos inferiores para la demo ZeroTier; no
operar Docker o Redash desde C. Los diagnósticos A/B se ejecutan por sus dueños.
Conservar ARPUJ para administrar B y confirmar reencendido desde plataforma
antes de cualquier apagado. [Etapas reales](../../App/infra/zerotier/ETAPAS-REALES.md).

**16/11/2026 — preparación ejecutable A/B/C:** solo consultas de estado del motor
y validación del cliente Compose; no arranque/parada/prueba de caída local, ni
operación sobre Redash u otros proyectos. El Mac tiene 8GiB físicos y el motor
2912MiB: no cumple las guardas A≥6144MiB/B≥3072MiB y no se asigna como A.
En la consulta posterior el socket Docker está ausente (info sale1); no se intenta
iniciar/restaurar el motor. Aparece ZeroTier1.16.2 instalado fuera de estos guiones,
primero listnetworks sale2 y a las 18:26 UTC responde con una red PRIVATE/OK y una
IP. Inventario real conservado privado, sin asignar rol. No se une/configura una
red ni se atribuye ese cambio del entorno a esta entrega. Reconsultar capacidad/estado antes de operar.
Los comandos nuevos usan ámbito propio y no invocan los procedimientos históricos
de alternancia de esta guía. [Plan y pendientes reales](PLAN-DEMO-ZEROTIER.md).


**Última ventana — 15/11 Bogotá, cierre de las 16 operaciones:** registro de
**105 contenedores originales**, Docker activo, once CU-015 y siete Redash activos;
preparación-base inactiva. Parada única por etapas, gracia 120 s: scheduler137,
OOMKilled=false, logs conservados sin certificar cierre ordenado. Otros cuatro
OOMKilled=true ya estaban en el estado inicial. Seis aplicaciones CU-015 cierran
0/143, sin OOM. Base, Redis/volumen, vhost, ocho cuentas iniciales y recursos
posteriores exclusivos; originales intactos y solo proveedores simulados.

Restauración única **21:45:10–21:46:21 UTC**: **105 mismos IDs/imágenes/montajes/
estados**, once CU-015 y siete Redash activos; preparación-base inactiva. Seis
nuevos detenidos **0/0/0/143/0/0 sin OOM**; todos los datos retenidos. Docker activo.
Los metadatos incluyen Núcleo/gateway anteriores conservados y Boletería propia;
no asumir siempre tres o cuatro contenedores nuevos. Se restauran las imágenes y
configuraciones originales, sin reconstruir/preparar/sembrar al reanudar.

Auditoría **21:48:03 UTC (16:48 Bogotá)**: /ping y /login timeout15s, curl28/HTTP000.
PostgreSQL listo y Redis PONG durante la restauración. Cgroups nuevos oom_kill:
server4, scheduled_worker2, adhoc_worker4, worker2; scheduler/Redis/PG0. Los200
puntuales del arranque escalonado no acreditan estabilidad sostenida. **Estados
restaurados; HTTP Redash bloqueado/inestable con OOM**, sin ciclos de recuperación,
limpiezas globales ni intervención de otros proyectos. Se requiere revisión de
capacidad/concurrencia por el responsable, no cambios globales desde esta entrega.
[Resultado y límites](../../App/infra/informe-atributos/seguridad/AUTORIZACION-CIERRE.md).

La preparación anterior de [dos servidores y un cliente](PLAN-DEMO-ZEROTIER.md)
fue documental. La entrega16/11 añade herramientas/configuración ejecutables y
pruebas locales de herramientas/CI; sigue sin configurar VPN ni acreditar caídas
entre computadores. Los procedimientos de las ventanas inferiores son históricos.


**Ventana anterior — 15/11 Bogotá, Evacuación/Monitoreo:** Docker **activo** al
inicio; registro de **101 originales**,11 CU-015 y 7 Redash activos. Redash se
detuvo una vez por etapas según la guía, gracia 120 s. Scheduler cerró137 con
OOMKilled=false, causa interna no aislada; logs/estado conservados, sin repetir
reinicios o presentarlo como cierre ordenado. Sus proveedores se detuvieron
después de registrar ese diagnóstico. Seis aplicaciones CU-015 cerraron0/143
sin OOM; proveedores conservados. Base/Redis/volumen/vhost nuevos y 9 cuentas
propias, sin semillas ni destinatarios/canales externos.

El gateway original conservaba un render anterior, sin módulos dinámicos del
develop integrado: lector403 allí/directo200. No se modifica imagen/configuración
original; un gateway actual exclusivo usa el puerto18100 durante las medidas.
Debe detenerse junto con Núcleo/Redis de ensayo antes de restaurar el gateway
original. El restaurador valida el conjunto exacto de ids nuevos del metadato,
incluido ese gateway, sin asumir siempre tres contenedores.

Restauración única terminada **2026-11-15T19:50:16 UTC**: **101 originales con
mismos ids/imágenes/montajes/estados**, once CU-015 y siete Redash activos otra
vez. Preparacion-base inicialmente inactiva sigue inactiva, sin ejecutarla.
**Cuatro nuevos detenidos, cierres 0/0/0/0 sin OOM**, datos/base/vhost/volúmenes
retenidos. Gateway original reanudado con su misma configuración; el actual de
ensayo queda detenido. Docker activo inicial/final; otros proyectos intactos.

Control posterior **15/11 19:53:00 UTC (14:53 Bogotá)**: `/ping` y `/login`
agotan **15 s**, curl28/HTTP000; PG listo y RedisPONG. Tras el arranque escalonado
hubo reset56 inicial y luego200, que no acreditan estabilidad sostenida. Nuevos
cgroups oom_kill: server **3**, scheduled_worker **2**, adhoc_worker **2**,
worker **2**, scheduler/Redis/PG **0**. Contadores aparte: gateway ajeno ya
restarting **29→109**, scheduler **2→1**. **Estados restaurados; HTTP Redash
bloqueado/inestable con OOM**, sin ciclos de recuperación, limpiezas o cambios
globales. No se intervienen otros proyectos para igualar contadores.


Los acuses asíncronos y expiraciones naturales se distinguen de mutaciones en
rechazos. Instantes completos privados por comparación en gzip; servidor Redis
leído atómicamente, sin alterar TTL/reloj. Los fallos del arnés y las series
interrumpidas se conservan. No se cambia capacidad global, limpian volúmenes o
intervienen otros proyectos. [Resultado](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

**Ventana anterior — 14/11 Bogotá, Eventos/Recintos:** Docker **activo** al
inicio/final. El registro inicial tenía **CU-015 (11 servicios) y Redash (7)
activos**; no asumir el estado detenido de ventanas anteriores. Se detuvo Redash
una vez antes de probar. La guarda bloqueó la primera preparación por Núcleo
original activo, antes de crear base. Se detuvieron solo las seis aplicaciones
CU-015 necesarias, validando ids/imágenes; proveedores conservados. Base/Redis/
volumen/vhost y cinco cuentas nuevos; sin semillas destructivas.

Tres finales normalizadas 218/218 con Redash detenido. Restauración única
terminada **15/11 03:59:22 UTC (14/11 Bogotá)**: **98 originales con mismos ids,
imágenes, montajes y estados**, once CU-015 y siete Redash activos otra vez;
preparacion-base inactiva, sin ejecutarla. Solo se reanudan los servicios activos
en el registro inicial; sin preparar, reconstruir o sembrar al restaurar.
Tres contenedores nuevos detenidos **0/0/0 sin OOM**, datos conservados. Otros
proyectos sin intervención; no se cambian límites globales ni se limpia Docker.

Control posterior **15/11 04:03:44 UTC (14/11 23:03 Bogotá)**: `/ping` timeout
15 s (curl28), `/login` respuesta vacía (curl52), HTTP000; PostgreSQL listo y
Redis PONG. Nuevos cgroups oom_kill: server **6**, worker **5**, adhoc_worker
**4**, scheduled_worker **4**, scheduler/proveedores **0**. **Estados restaurados;
HTTP bloqueado/inestable y estabilidad sostenida pendiente.** No se hicieron
ciclos de recuperación. Requiere capacidad autorizada/revisión del responsable;
sin detener otros proyectos ni alterar recursos globales. Contadores aparte:
gateway ajeno ya restarting **89→127**, scheduler **40→2**; no se restauran
contadores mediante intervenciones. [Resultado y evidencia](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

**Ventana anterior — 13/11, revalidación SSE:** Docker **activo** al inicio/final;
**95 IDs/imágenes/montajes/estados originales conservados**, CU-015/ZAP detenidos,
otros proyectos sin intervención. Base/Redis/volumen/vhost nuevos, datos/credenciales
anteriores intactos. Tres nuevos contenedores detenidos **0/0/0 sin OOM**, datos
conservados. Imagen corregida solo del Núcleo de ensayo; originales intactas.
Tres finales SSE aprobadas sin repetir los 300 ni los 16 recorridos. SIGTERM con
dos flujos abiertos por pasada cerró proceso y conexiones en **246–272 ms**, límite
existente **5 s**. No se amplían límites ni se reinterpreta el incidente anterior.

Siete Redash reanudados una sola vez. Reset inicial y luego 200 durante la
incorporación de servicios. Control posterior **14/11 03:16:49 UTC (13/11 22:16
Bogotá)**: **/ping y /login agotan 15 s**, PostgreSQL listo/Redis PONG. Nuevo
cgroup: oom_kill server **2**, worker **5**, adhoc_worker **1**, scheduled_worker
**1**, scheduler/proveedores **0**. **Estados restaurados; HTTP bloqueado por
capacidad/OOM**, sin ciclos manuales de recuperación. Los 200 anteriores no
acreditan estabilidad. Requiere capacidad autorizada/revisión de concurrencia y
comprobación del responsable, sin detener otros proyectos ni cambiar recursos globales.

Contadores registrados aparte: gateway de otro proyecto ya estaba restarting
**272→289**, scheduler **3→1** durante alternancia. No se intervienen para igualar
contadores. Recursos Redis con fallo simulado fueron exclusivamente el nuevo
contenedor del ensayo (CLIENT PAUSE con fin programado), nunca Redis compartido.
[Resultado](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

**Última ventana — 13/11, Parqueaderos:** Docker **activo** al inicio/final;
**92 IDs/imágenes/montajes/estados originales conservados**, CU-015/ZAP detenidos.
Base original con cero tarifas intacta. Para los positivos globales se añadieron
base/Redis/volumen/vhost y Núcleo exclusivos; tres contenedores nuevos ahora
detenidos, cierre **0/0/0 sin OOM**, datos conservados. No se reconstruyeron
imágenes originales ni se cambiaron cuentas/claves/config previas. Tres finales
nuevas **300/300**, Parqueaderos **25/25**, global **113/159**. Las guías inferiores
sobre reanudación sin preparación siguen aplicando a los contenedores anteriores.

Los siete Redash reanudados una sola vez. Primeras sondas del servidor tuvieron
reset; las siguientes /ping y /login **200**. Control posterior **14/11 01:20:56
UTC (13/11 20:20 Bogotá): ambas 200**, PG listo/Redis PONG. Cgroups del nuevo
arranque: oom_kill server **3**, worker **4**, adhoc_worker **1**, scheduled_worker
**2**, scheduler/proveedores **0**. El 200 puntual no elimina el bloqueo histórico
por OOM/capacidad ni acredita disponibilidad sostenida; sin ciclos manuales de
recuperación, sin intervenir otros proyectos ni modificar recursos globales.

El primer chequeo de restauración falló por exigir contadores de reinicio
idénticos pese a conservar estados. Auditoría posterior **solo lectura** confirmó
los 92 originales; gateway de otro proyecto ya estaba restarting (147→175), sin
intervención; scheduler 3→1 durante alternancia. Los contadores se conservan como
observación, no se intentan restaurar. El arnés ya distingue ambas condiciones.
[Resultado e historial](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

**Última ventana — 13/11, Compras/Reventa:** motor **activo** al inicio y al final.
Mismos 92 IDs/imágenes/montajes y estados activo/detenido; CU-015/ZAP detenidos,
siete Redash reanudados una sola vez, otros proyectos sin intervención. Tres
finales nuevas 150/150 con Redash detenido, datos/volúmenes/claves conservados.
No se construyó ni resembró el entorno. CU-015 cerró 0/143 sin OOM/SIGKILL.

Control **14/11 00:02:16 UTC (13/11 19:02 Bogotá)**: PG listo/Redis PONG;
`/ping` y `/login` agotan 15 s. Nuevo cgroup del servidor **oom_kill=2**, otros
seis 0 en ese control; el servidor tenía cero al arrancar. Se conservan marcas
históricas separadas. PG requirió esperar disponibilidad inicial, sin reiniciarlo.
**Estados restaurados, HTTP sigue bloqueado**; sin ciclos de recuperación.
Requiere capacidad autorizada/revisión de concurrencia y comprobación HTTP del
responsable, sin intervenir otros proyectos ni cambiar recursos globales.
[Resultado](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

**Última ventana — 13/11, autorización de Alimentos:** Docker estaba **activo**
al inicio y se deja **activo**. CU-015/ZAP detenidos; siete IDs/imágenes/montajes
Redash reanudados una sola vez, estados originales conservados. Las tres finales
de Alimentos aprobaron 278/278 cada una, con Redash detenido; otros proyectos no
se intervinieron. No se reconstruyó ni resiembra el entorno.

PG listo y Redis PONG; `/ping` y `/login` dieron 200 en cada etapa, con siete
cgroups sin oom_kill entonces. Control posterior **22:53:57 UTC**: ambas rutas
agotan 15 s. **OOM nuevos posteriores**: server 3, worker 8, adhoc_worker 3,
scheduled_worker 2; proveedores/scheduler 0. VM disponible 140780 KiB y swap libre
3268 KiB. No se hicieron reinicios de recuperación. **Estados restaurados;
disponibilidad HTTP pendiente**. El responsable debe liberar capacidad autorizada
o revisar concurrencia de Redash y verificar HTTP; no intervenir otros proyectos.
Las marcas OOMKilled históricas no se confunden con esos contadores nuevos.
Detalles y fallos de arnés en [RESULTADO](../../App/infra/informe-atributos/seguridad/RESULTADO.md).

Los registros de motor apagado inferiores describen ventanas anteriores.


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
