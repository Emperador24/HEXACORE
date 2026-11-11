# Cierre de Alimentos — Sebastián

## Integración de develop, demo y compatibilidad de CI — 11 de noviembre de 2026

PR nuevo: [#49](https://github.com/Emperador24/HEXACORE/pull/49), hacia develop,
sin merge ni auto-merge. El PR #48 ya estaba integrado. Se comprobaron las remotas:
`origin/develop=6e5e7fa` (incluye #47 de Samuel), `origin/feature/samuel=5c641a8`
y la rama propia publicada antes de empezar en `ab6ae56`.

Primero se revisaron y conservaron los doce archivos locales del demo en
**9707569**, sin incluir `.env.local`, claves, trazas ni informes privados.
Después se integró `origin/develop` mediante el merge **5131b1e**, sin conflictos,
reset ni force-push. El trabajo de Samuel se conserva: versiones de evento en
las cuatro copias de Entradas, reservas de Parqueaderos y cambios de despliegue,
pagos/correo y clientes. Se comprobaron las rutas existentes de Alimentos en web
y Flutter. No se activó Stripe, SMTP ni un despliegue real para verificarlo.

La corrección funcional de CI está en **6683795**:

- **Checkout detached:** en la ejecución
  [42825246231](https://github.com/Emperador24/HEXACORE/actions/runs/42825246231),
  la consulta de configuración CU-015 fallaba por exigir una rama local. Solo
  `config` puede resolver y validar en lectura desde otra rama/detached. Las
  acciones iniciar/parar/estado/logs siguen exigiendo su rama; se mantienen las
  comprobaciones de Docker local, destinos, etiquetas, checkout, puertos y
  recursos. La prueba nueva rechaza operaciones en detached/develop/otra rama.
- **Convivencia de Logística:** la expectativa antigua `[3,2,4]` confundía el
  historial actual de Alimentos con su corte inicial. Su registro vigente tiene
  seis nombres: EsquemaInicialCu011, ReservasInventarioCu011,
  GestionEstablecimientosCu015, MenuInventarioCu012, PreparacionCu013 y EntregaCu014
  (con sus timestamps completos del registro canónico). Se comparan ahora los
  nombres y timestamps exactos de cada historial, base y esquema de cada pool,
  y `synchronize=false`; no se sustituye simplemente 2 por 6.
- **Captura histórica:** el selector recorría las carpetas actuales y excluía
  solamente CU-007. Incorporaba cinco fuentes posteriores al corte, de ahí
  **23 en vez de 18**; después del merge también habría incluido las cuatro
  VersionEvento nuevas. Ahora usa la lista positiva `PROCEDENCIA_ORIGINAL`,
  comprueba 18 rutas únicas, propietario de cada fuente, nombre y SHA antes de
  inmovilizar el origen. Los ocho historiales y sus registros siguen siendo
  validados durante la captura. Una prueba compara las 18 fuentes contra el
  commit fijado **be57961472a0802c90a57d247fb67e96e6717b1b**, excluye las posteriores
  y rechaza una huella/propietario alterados en memoria. Se añade a la CI antes
  de levantar la referencia. No se altera ninguna de las 18 migraciones ni su
  procedencia; se conservan las guardas del ensayo y sus recursos separados.

Tras integrar Samuel, el registro actual suma **34 migraciones**: las 29
anteriores más cuatro VersionEvento (Ventas, Catálogo, Postventa y Acceso QR) y
Cu021Cu023ReservasEspacios de Parqueaderos. Esto no amplía el corte histórico
de 18. Las 13 pruebas de esquemas comprueban ese registro y las huellas conservadas.

| Verificación local de esta entrega | Resultado |
|---|---|
| Tipos y build del backend integrado, Node 22.22.3 | Aprobados |
| Guardas de revisión y salud | **14/14** |
| Procedencias contra el Git fijado y controles negativos | **3/3** |
| Esquemas y 18 fuentes conservadas | **13/13** |
| Archivo histórico, sin Docker | Tres archivos idénticos a be579614; aprobado |
| Tipos E2E y configuración/fronteras | Aprobados |
| Consumidor de eventos: entrega, confirmación y DLQ | **15/15** |

Se reutiliza la verificación del demo ya realizada: CU-029 visual completo
**1/1**, ocho pausas medidas de cinco segundos y slowMo en los contextos reales,
incluidos los explícitos; CU-015 normal **1/1**. Sus dos demos fallidos siguen
registrados. No se repitieron recorridos locales por los cambios de documentación.
El demo mantiene su configuración, pausas, foco e informes separados. Playwright
normal/CI conserva 120 s por test, 15 s por aserción y cero reintentos; el
presupuesto ampliado de presentación es exclusivo del demo.

**Primera GitHub CI de la entrega:**
[43035031451](https://github.com/Emperador24/HEXACORE/actions/runs/43035031451),
SHA **6683795**: **6/8 trabajos aprobados**. La guarda detached y la captura,
conciliación, procedencias y lectura de las 18 migraciones históricas aprobaron.
Se diagnosticaron otros dos fallos antes de publicar la siguiente corrección:

- Una unitaria de Samuel generaba dos mensajes con `new Date()` y comparaba
  timestamps separados por 1 ms (**982/983** pruebas). Ahora entrega y compara
  el mismo evento, con la aserción completa intacta; la suite dirigida aprueba
  **15/15**.
- El escenario de aplicaciones actuales solo insertaba la referencia antigua
  de Alimentos, pero el checkout consulta `eventos_recintos.eventos`: devolvía
  **404**. El contexto exclusivo de base única prepara ahora recinto y evento
  publicado en el esquema propietario comprobado. La preparación del origen
  histórico no recibe ese contexto y conserva su comportamiento. No se cambian
  el HTTP esperado, las aserciones, los límites ni los reintentos.

La segunda ejecución,
[43036251973](https://github.com/Emperador24/HEXACORE/actions/runs/43036251973),
SHA **785d701**, volvió a aprobar **6/8 trabajos**: incluye autenticación,
**983/983 unitarias** y la convivencia de Logística con nombres e historiales
exactos. El escenario común completó **46 comprobaciones HTTP/proyecciones**
sobre la copia transferida; la conciliación histórica aprobó **12/12**. Quedaron
dos incompatibilidades de fixtures, diagnosticadas antes de volver a publicar:

- **403 del lector Personal conservado:** el corte precede al vínculo CU-015.
  La prueba comprueba primero el rechazo y completa el vínculo únicamente en la
  copia, conservando la referencia y la lectura del pedido original (suite
  entonces **4/5**). No se elimina la guarda ni se cambia el 200 esperado.
- **Tarifa offline inexistente:** la salida simulada ocurre cinco minutos antes
  del ensayo y sus tarifas nacían al iniciarlo (Núcleo **121/122**, segunda pasada
  aún no ejecutada). Ahora el fixture inserta una tarifa anterior de 3000 y
  comprueba que se usa esa, mientras la caché actual sigue valiendo 5000. Se
  conservan cobro de dos horas, sincronización e idempotencia. No se cambia
  código productivo, tiempos ni reintentos de Parqueaderos.

Las comprobaciones completas sobre copia transferida e instalación nueva siguen
en los runners aislados, sin usar la referencia A/B del Mac. No se relanzaron
ejecuciones fallidas. Logs locales privados en
`App/e2e/.evidencia/integracion-ci-2026-11-11T13-52-03Z/`.

**La aceptación conjunta local sigue pendiente: 10/13 automática y 12/13
visible**, correspondientes al cierre del 8 de noviembre. No se convierten en
verde por una CI aprobada, por tipos/unitarias ni por el demo. CU-028 continúa
sin implementación; no se añaden casos de uso, CU-011F, F12 o seguridad global.
No se detuvo Redash ni otro proyecto, no se borraron volúmenes ni se repitieron
semillas locales. Las verificaciones locales usaron proveedores simulados.

## Estabilidad conjunta — 8 de noviembre de 2026

**La aceptación conjunta sigue pendiente. Último automático: 10/13; último
visible, separado: 12/13; ambos salida 1.** No se suman aprobaciones individuales
ni se presenta CU-028 como implementado. Base publicada al comenzar:
`fafedfe87a2fb75c0026253fb6f543b9a0650d9f`, rama `feature/sebastian` limpia.
No se integran develop/main ni se añaden casos de uso. Las secciones posteriores
conservan el historial de las entregas anteriores.

### Correcciones comprobadas

- **Conexiones inactivas:** la sonda cada 10 s coincidía con el descarte de
  `pg-pool` a los 10 s, con mínimo cero. La comparación real, tres SELECT separados
  por 10,5 s, abrió tres backends con `min=0` y reutilizó uno con `min=1`.
  `opcionesSesion` conserva ahora una conexión por pool de negocio; no cambia
  máximo 10 ni conexión/consulta/statement de 3 s. Ambos controles cierran todas
  las conexiones al terminar. Ya desplegado, Logística, Parqueaderos, Pagos de
  Núcleo y Catálogo conservaron su PID durante las tres lecturas. No es prueba de
  que esta apertura/cierre explicara todos los fallos anteriores.
- **Sondas del entorno de revisión:** Núcleo, Boletería y Trabajador consultan la
  misma salud HTTP con BusyBox, exigiendo exactamente 200. Se conservan intervalo
  10 s, plazo 5 s, diez fallos y tiempos iniciales anteriores. La sonda Node
  consumió 28.656/48.588 KiB de RSS en dos muestras; el script completo, 888 KiB.
  Guardas y casos HTTP comprueban rechazo de 201, redirección, 503 y fallo de red.
  No se cambia Compose habitual/A/B ni las sondas de los proveedores.
- **DNS en el camino de las solicitudes:** el 503 de Mis pedidos a las
  14:37:14,920 UTC se correlacionó con `nucleo could not be resolved` a las
  14:37:26. Nginx 1.27.5 ya admite grupos upstream con zona compartida y
  `server ... resolve`; se usan para ambos procesos. DNS Docker, TTL 5 s y espera
  3 s se conservan, sin IP fija ni nuevos reintentos de negocio. El ensayo en el
  gateway propio introdujo un resolver inaccesible: **control anterior 503,
  upstream conocido 200**. Restauró DNS/configuración y retiró sus rutas
  temporales. Se comprobó también acceso real a Núcleo/Boletería y rechazo 401.
  Esto protege el destino ya conocido ante un fallo transitorio; NXDOMAIN lo
  retira y el arranque sigue necesitando resolver. No corrige el DNS de Docker ni
  oculta errores HTTP del servicio. `ngx.fetch` de Cola conserva su DNS directo.
  Explicación y fuentes primarias: [gateway](../../App/gateway/README.md).
- **Sincronización CU-012:** en el primer conjunto corregido el PUT de vínculo
  respondió 200 en 681 ms y el GET posterior en 14.094 ms; la espera del mensaje
  terminó antes de verlo. El test comprueba ahora ambos HTTP 200 antes del aviso.
  Pasó dirigido **1/1**. No se cambian 120 s por test, 15 s de aserciones,
  reintentos cero ni el contrato de operaciones 202 por el mismo UUID.

### Todos los conjuntos conservados en esta etapa

Cada ejecución recorre los trece casos, un trabajador, sin omisiones ni reintentos.
Las carpetas están bajo `App/e2e/.evidencia/`, privadas e ignoradas por Git.

| Ejecución | Resultado | Evidencia privada |
|---|---|---|
| Referencia reproducida antes de corregir | **9/13**, 7,6 min, salida 1 | `conjunto-observado-2026-11-08T13-53-16-678Z/` |
| Conexiones y sondas corregidas | **12/13**, 3,6 min, salida 1 | `conjunto-observado-2026-11-08T14-31-33-085Z/` |
| Después de sincronizar CU-012 | **11/13**, 3,7 min, salida 1 | `conjunto-observado-2026-11-08T14-36-09-624Z/` |
| **Último automático, incluye DNS** | **10/13**, 5,2 min, salida 1 | `conjunto-observado-2026-11-08T14-46-48-499Z/` |
| **Último visible, separado, mismas correcciones** | **12/13**, 4,1 min, salida 1 | `conjunto-observado-2026-11-08T14-52-23-114Z/` |

La repetición del segundo conjunto respondió al fallo de sincronización comprobado;
la del tercero, al DNS confirmado. No se repiten conjuntos para buscar un verde.
Automático final: **14:46:50,566–14:52:01,746 UTC**. Visible final:
**14:52:24,941–14:56:33,824 UTC** (09:52–09:56 en Bogotá).

### Fallos correlacionados y límites de la explicación

En la referencia 9/13: CU-012 visual renovó a las **13:53:46,455**, 503 tras
5.194 ms; Identidad registró **connection timeout PostgreSQL a las 13:53:51**.
No fue un DNS confirmado. CU-012 API creó producto a las **13:54:13,866** y recibió
500 tras 8.525 ms; `FALLO_SQL` registró **COMMIT / Query read timeout** a las
13:54:22,268, bucle Node máximo 14.982 ms y cero solicitudes esperando en los siete
pools al capturar. Otro fallo SELECT/57014 a las 13:58:02,923 tenía máximo Node
19.227 ms. CU-014 visual guardó preparación 200 a las 13:57:27,875; su GET posterior
se abortó tras 15.012 ms y no llegó a enviar Marcar listo. CU-027 desactivó 200 a
las 14:00:26,755; el GET posterior se abortó tras 15.001 ms. El `unexpected DNS
response` a las 13:58:01 es un incidente separado, sin petición identificada.

El conjunto intermedio 11/13 tuvo el 503 DNS de CU-013 ya descrito; CU-027 negativo
agotó renovación a las **14:39:31,877**, abortada a los 15.013 ms / 499 del gateway.
No hay un error DNS asociado a esa renovación y no se le atribuye esa causa.

Fallos del **último automático 10/13**:

- CU-012 visual: POST producto a las **14:47:12,027**, cancelado por el cliente
  tras **15.006 ms**, 499 en gateway; el test terminó a 120 s esperando respuesta.
  El 499 no determina por sí solo dónde se produjo la espera upstream.
- CU-012 API: reserva creada a las **14:49:05,274** no alcanzó LIBERADA en los
  15 s exigidos. PostgreSQL canceló la lectura de transacciones a las
  **14:49:22,726**, hubo `EXPIRACION_RESERVA_PENDIENTE` a las 14:49:25 y la fila
  quedó **LIBERADA a las 14:49:29,618**. Esa liberación tardía no aprueba el caso.
  Otro SELECT de candidatas expiradas se canceló a las 14:48:57,011. También
  caducaron consultas del observador; no se cuentan como fallos de negocio.
- CU-027 visual: PATCH perfil **200 en 76 ms a las 14:51:27,662**; tras recargar,
  renovación 200 en 189 ms, pero GET sesión actual a las **14:51:27,960** quedó
  sin respuesta terminada en la traza y el campo no apareció dentro de 15 s.
  No hay evidencia suficiente para asignar una causa única a esa espera.

Falló únicamente CU-013 en el **último visible 12/13**: al recargar el cliente,
POST renovación a las **14:53:45,980** recibió **503 tras 8.215 ms**. Identidad
registró **PostgreSQL no disponible: Query read timeout a las 14:53:53**.
Es un fallo de disponibilidad SQL de autenticación, no un DNS confirmado ni una
aserción que deba relajarse. El filtro de Identidad y los ciclos de fondo no
pasan siempre por `DiagnosticoPG`: cero eventos `FALLO_SQL` no significa cero
errores SQL. Se conservan sus logs y los del servidor PostgreSQL.
El 500 de COMMIT de la referencia no se repitió en los conjuntos finales; eso
no demuestra que su causa haya quedado resuelta. SQL de fondo y autenticación
sí volvieron a fallar.

No se demostró agotamiento de conexiones: en los conjuntos finales se observaron
como máximo tres conexiones simultáneas por pool de Núcleo frente a diez permitidas.
Las esperas por bloqueo capturadas fueron **596 ms** en automático y **400 ms** en
visible; no explican por sí solas los retrasos completos ni excluyen picos entre
muestras. Los sondeos de expiración y ajustes ya evitan ciclos superpuestos;
ajustes limita a cincuenta y recupera por establecimiento bajo su bloqueo.
Las renovaciones concurrentes ya comparten promesa y las contraseñas usan scrypt
asíncrono; no se rebaja su coste. El sondeo de ajustes llegó a 72 ms de ejecución
SQL en la referencia, pero ese EXPLAIN no mide todas las consultas fallidas.

### Condiciones y bloqueo restante

Mac M2, 8 GB, Node **22.22.3**; builds, suites y navegadores en serie. Docker Desktop
estaba cerrado al comenzar: se abrió y restauró sus contenedores configurados.
En **ambos conjuntos finales** estaban activos **los once propios** de
`hexacore-cu015-sebastian`: Núcleo, Boletería, Trabajador, gateway, ambos portales,
PostgreSQL, Redis, RabbitMQ, pasarela y correo; además **treinta ajenos/habituales**.
CU-013 API y CU-014 API paran/arrancan deliberadamente solo Núcleo para comprobar
persistencia; no son una pausa general del entorno durante la aceptación.
La preparación finita había terminado sin migraciones nuevas, sin semillas.
No se paró/modificó ningún recurso ajeno, habitual o A/B ni se cambiaron los
recursos globales de Docker. No se borraron datos/claves/volúmenes ni se reconstruyó
Redis. Las seis aplicaciones propias se pausaron con guardas durante unitarias,
builds y regresiones, y se restauraron antes de la aceptación.
Al cerrar, los once propios están healthy, sin OOM; los treinta restantes
conservan sus mismos ID. Ese estado de salud no cambia los resultados fallidos.

Imágenes efectivas nuevas: Núcleo **b0678764f298**, Boletería **7fa3503e42ce**
(revisión `748313d`), gateway **35c1e44dabeb** (`f68766d`). Boletería lleva etiqueta
de fuente modificada porque se estaba añadiendo la opción del runner de regresión;
el SHA-256 del JS de sesiones de ambos procesos coincide con el dist local y
contiene `min:1`. Trabajador y portales conservan sus imágenes previas; la sonda
del primero cambia por montaje propio. La configuración efectiva del gateway
coincide con la generada CU-015. No se supone que todas las imágenes lleven HEAD.

La VM dispone de **2,84 GiB / ocho vCPU para 41 contenedores**. Durante el último
automático se observaron **135–175 MiB disponibles y unos 0,2 MiB libres de 1 GiB
de swap**. La presión de memoria `full avg10` de la VM osciló **9,94–66,35 %** en
automático y **3,74–40,79 %** en visible. Los contadores del cgroup propio muestran
reclamación/refallos mayores de páginas, sin OOM ni limitación de CPU por cuota.
Son pruebas de presión real, no de que explique por sí sola cada SQL/DNS/499.

El consumo observado de `redash-server-1`, `redash-adhoc_worker-1`,
`redash-scheduled_worker-1`, `redash-worker-1` y `redash-scheduler-1` suma
aproximadamente **1,56 GiB** (suma de medianas de Docker stats del automático).
**El contraste pendiente requiere que su propietario libere capacidad**, por
ejemplo pausando sus cargas Redash no necesarias, o que el administrador ajuste
el presupuesto de memoria de la VM según el host. Después deben repetirse ambos
conjuntos con las mismas fuentes y medir de nuevo. No se intervino ese proyecto
ni se afirma que liberarlo garantice verde: falta ese contraste causal.
Los 500/503/499 y retrasos de fondo siguen abiertos; el diagnóstico no certifica
disponibilidad productiva, incluso si dos conjuntos posteriores aprobaran.

### Verificaciones y reproducción

Tipos/build Núcleo y Boletería y builds de las tres imágenes modificadas aprobados; backend
**919/919, 64 suites**, tipos E2E, fronteras/configuración y **13/13 guardas**.
CU-011 original **9/9, 12,629 s**, Boletería **23/23, 28,692 s**, incluyendo cierre
de sus cinco pools, AMQP y Redis. Sus recursos propios de regresión quedaron
detenidos y los volúmenes conservados. CU-012 recuperación pasó respuesta Redis
perdida, AOF no confirmado, reconexión, commit SQL perdido, conexión cerrada,
liberación/consumo pendientes y SIGKILL; el reinicio real recuperó **cinco
operaciones inciertas sin doble ajuste ni reinicialización Redis**. Los controles
de pool y DNS pasaron. No hay cambios de esquema/frontend/Flutter; se reutiliza
la evidencia CU-014/cámara y demostraciones anteriores.

Con Node 22.22.3 y la clave demo definida solo localmente, desde la raíz, en serie:

```bash
./App/infra/cu015.sh iniciar --compilar nucleo boleteria api-gateway
npm --prefix App/backend run test:cu015:pool
python3 App/infra/revision/test_dns.py
node App/backend/test/cu013/referencia.cjs --implementados
node App/backend/test/cu013/referencia.cjs --implementados --visible
# Regresiones de procesos: builds host previos; pausar aplicaciones propias.
npm --prefix App/backend run build
npm --prefix App/backend run build:boleteria
npm --prefix App/backend run test:cu015:regresion -- --boleteria
npm --prefix App/backend run test:cu012:recuperacion
```

El observador existente conserva SQL, recursos y logs; añade cgroup propio y
`--visible`, sin cambiar el contrato de pruebas ni crear otro sistema. Guardar
stdout de cada intento en un archivo distinto: `estabilidad-inicio/` conserva
los de esta etapa. [Guía de ejecución](../../App/e2e/README.md).
`test:implementados` mantiene los trece; `test:completo` y el observador conservan
**salida 2 cuando pasan pero CU-028 sigue bloqueado**, y salida de fallo cuando no.
Samuel `f2db59e` / develop `a2e85d5` siguen sin la implementación CU-028. No se
implementan CU-011F, F12, CU-028 ni auditoría global OWASP en esta entrega.

## Registro anterior: CU-014 y demostraciones CU-027/029 — 8 de noviembre de 2026

CU-014 queda implementado y demostrado: entrega única transaccional, revisión
previa sin consumo, respuesta perdida/replay, conservación financiera y cámara
física. El último conjunto real terminó **10/13**, no verde. CU-028 sigue
bloqueado por su implementación pendiente; las ejecuciones individuales no
modifican el resultado conjunto.

| Comprobación de este cierre | Resultado real |
|---|---|
| Backend tipos/build y suite completa | **919/919, 64 suites**; 105 afectados comprobados también por separado |
| Angular administrativo / cliente | **10/10 + 19/19**, builds de ambos aprobados |
| Flutter | Analyze limpio, **66/66**; cámara física **1/1** en iPhone 17 Pro Max, iOS 26.6 |
| Migración CU-014 y regresiones CU-013/012/015 | **2/2 + 2/2 + 2/2 + 2/2**; 29 migraciones, 18 procedencias, 80 tablas en once esquemas y vacía sin negocio |
| CU-011 original | **9/9**, 13,489 s; recursos de regresión detenidos, volúmenes conservados |
| Fronteras/configuración y guardas | Aprobadas, **11/11** guardas |
| CU-014 y CU-027 dentro del último conjunto | **3/3 + 2/2**, con backend/persistencia reales |
| CU-029 visible posterior al conjunto | **2/2**, 51,6 s; no convierte el conjunto en 11/13 |
| Último conjunto de trece, aplicaciones propias activas | **10/13**, 7,6 min, salida 1; sin omisiones, trabajador 1, reintentos 0, 120 s / 15 s |
| CU-028 | **BLOQUEADO**: roles/permisos mantiene placeholder; no se acredita CRUD/matriz/propagación/auditoría |

Base publicada comprobada: `db6f053d7e7259ad39684d26f085744afbbd0e24`,
`feature/sebastian` limpia y sincronizada al comenzar. Se conserva el entorno
CU-015 y todo recurso ajeno/A/B. No se integran develop ni cambios de parqueaderos.

Fuentes de la referencia inicial: Núcleo `b255758` (`3ecf3257c1d9`), portales `c196e1d`
(`31201b4c7210` y `7e9ea421bfcd`) y gateway `09b0199`. SHA-256 de preparación,
recepción y pagos coincide con el dist local. La referencia conjunta inicial
CU-012/013/015 terminó **4/6**: pasaron API CU-012, ambos CU-013 y API CU-015;
las interfaces CU-012/CU-015 agotaron 120 s. Evidencia privada
`.evidencia/cu013-referencia-2026-11-08T04-54-50-087Z/`. Núcleo registró a las
04:55:31 UTC PostgreSQL no disponible por statement timeout; no hubo resolución
DNS fallida registrada en esa ejecución. No se atribuye sin prueba cada timeout
del navegador a ese fallo. SQL, DNS confirmado y 499 histórico siguen separados;
la API individual anterior no convirtió el conjunto previo 5/6 en verde.

Remotas consultadas: `feature/samuel=f2db59e`, `develop=a2e85d5`, sin publicación
posterior encontrada. Roles/permisos mantiene placeholder en ambas; roles fijos,
sesiones y guardas existentes no equivalen al CRUD/matriz/propagación/auditoría
CU-028. La demostración completa de CU-028 está bloqueada por esa dependencia de
Samuel; no se implementa su sistema ni se presenta el placeholder como aprobado.

[Decisión CU-014](../../App/backend/modulos/alimentos/recepcion/DECISION-CU014.md):
prevalidación sin consumo, confirmación en transacción con relectura/bloqueo de
cuenta, rol, vínculo, punto y pedido; entrega única persistente, historial/aviso,
versión y replay. Se conserva CONFIRMADO, importe, inventario y referencia QR.
La intención local no guarda el secreto; recuperar sin QR solo devuelve un
resultado anterior. Escáner 7.4.2 existente con ciclo de vida/permisos/detecciones
repetidas; entrada manual completa y confirmación explícita.

Comprobaciones actuales: backend tipos/build y **919/919 en 64 suites**;
Angular administrativo **10/10**, cliente **19/19**; Flutter analyze limpio y
**66/66**, más cámara física **1/1**. Migración CU-014 vacía/desde 28 **2/2**,
29 migraciones y 18 procedencias. Bases iniciales propias
`cu014_2a426d6d7290_vacia/actualizacion`; productos, reservas, pedidos,
preparaciones, avisos, pagos locales y libro anterior comparados íntegramente.
Regresiones migraciones CU-013/012/015 **2/2 + 2/2 + 2/2**, con bases
`cu013_75b279750094`, `cu012_5eea418995da`, `cu015_a431ddb209dd`
(sufijos `_vacia`/`_actualizacion`). Fronteras/configuración aprobadas y guardas
**11/11**. CU-011 original **9/9**, 13,489 s, proyecto de regresión detenido,
volúmenes conservados. Las ejecuciones individuales conservan su alcance, sin sumarlas como conjunto.
CU-014 visible pasó **3/3** dentro de un conjunto nuevo **5/7**; CU-027 visible
pasó después **2/2** dentro de **3/4**; la primera ejecución aprobada CU-029
fue **2/2**, 24,4 s. El individual posterior al último conjunto figura arriba.
Los fallos nuevos de demostración fueron del test: navegación antes de consumir
la respuesta de logout (traza DELETE abortada), zona inicial no contabilizada y
DTO de recinto anidado interpretado como objeto raíz. Se esperan respuesta/estado real,
se seleccionan zonas por nombre tras ordenarlas el servidor y se consulta
`recinto.zonas`; no se cambia el producto para acomodar la demostración.
Evidencias: `.evidencia/cu014-027-029-visible-1/`,
`cu027-029-visible-2/` y `cu029-visible-3/`.
La repetición CU-014 de migraciones **2/2** (`cu014_73b97190d668`) exige además
**80 tablas en once esquemas y 33 filas**: 29 historiales y cuatro roles, cero negocio.
`test:preparacion` conserva seis casos para el observador histórico;
`test:alimentos` incluye CU-014 (nueve) y el conjunto implementado tiene trece.

Fallos de esta etapa conservados: backend **918/919** por expectativa antigua de
28 migraciones (corregida a 29, sin tocar las 18 huellas). CU-014 individual
**2/3**: API/concurrencia/reinicio y carreras de autorización pasan; UI completó
entrega/replay/aviso pero falló al exigir el mensaje humano de segundo uso.
AuthService administrativo descartaba `message` cuando existía `codigo`; se
corrigió conservando ambos contratos `message`/`mensaje`, con pruebas HTTP reales
del cliente Angular. CU-011 primero **0/9**, preparación interrumpida por timeout
3 s de `/api/connections` de RabbitMQ; su repetición **0/9** detectó un recinto
fixture de nombre fijo dejado tras ese fallo. Se usa ahora nombre con UUID propio,
sin borrar filas previas ni reducir aserciones. La tercera pasó **9/9**. El timeout
RabbitMQ se conserva como incidente distinto, sin causa atribuida ni reintentos
nuevos/plazos mayores. Logs privados preservan todos los intentos.

Cámara física comprobada en **iPhone 17 Pro Max (iPhone18,2), iOS 26.6**,
con Xcode 27.0 y el componente real/mobile_scanner 7.4.2: **1/1** en 8 s.
Se leyó ópticamente en el teléfono el QR real CU-011 abierto en el Mac,
comparado mediante verificador del ensayo sin imprimir el secreto; se comprobó
cierre del escáner. Es prueba de lectura/cierre, separada del negocio con
backend real y de los negativos de permisos/ciclo de vida probados por widget.
Primer lanzamiento: compiló, pero no descubrió Dart VM y no ejecutó tests;
el usuario identificó una solicitud de control de Xcode en el Mac. Tras indicar
que la aceptara, el segundo lanzamiento ejecutó y pasó. Logs/imagen/huellas y
firma privada permanecen fuera de Git. No se cambiaron paquetes ni permisos.

Primer conjunto de trece: **9/13**, 6,0 min, código 1, evidencia
`.evidencia/conjunto-2026-11-08T06-17-23-191Z/`. Fallos: CU-012 API esperaba 200
inmediato de un ajuste que devolvió 202; CU-013 visual recibió 503 DNS al consultar
Mis pedidos; CU-014 carrera no alcanzó su preparación por 503/timeout de cabecera
upstream en POST recintos; CU-027 visual recibió 503 DNS al login administrativo.
CU-014 manual y API/reinicio, ambos CU-015 y ambos CU-029 pasaron.
Se extiende a todos los ajustes CU-012 la consulta de la misma intención ya usada
en concurrencia: 202 exige PENDIENTE y luego APLICADA/RECHAZADA según el escenario,
sin reenviar POST ni ocultar HTTP/transporte; se conserva stock final y replay
estricto. La API individual corregida pasó **1/1**, 13,2 s; no transforma el 9/13.
La repetición observada de trece se detalla a continuación.

Logs del conjunto: DNS confirmado en gateway a las **06:19:10 UTC** (GET Mis
pedidos) y **06:22:42** (POST sesiones). A las **06:19:11.344** hubo además
QUERY_READ_TIMEOUT SQL; siete pools con esperando=0, Alimentos total=2/libres=0,
y máximo del bucle Node **13.195,28 ms** desde arranque/fallo anterior. No acredita
agotamiento del pool ni causa única de DNS/SQL. POST recintos agotó espera de
cabecera upstream a las **06:21:30**, sin DNS en esa petición; no se atribuye su
causa a SQL sin evidencia. El 499 histórico de Eventos permanece sin causa.

Último conjunto observado: **10/13**, evidencia
`.evidencia/conjunto-observado-2026-11-08T06-27-09-380Z/`, Playwright/salida 1,
CU-028 explícitamente BLOQUEADO y `completo=false`. Pasaron API CU-012,
API CU-013, los tres CU-014, ambos CU-015, ambos CU-027 y el negativo CU-029.
Fallaron: UI CU-012 tras 503 en renovación de sesión al recargar; UI CU-013 por
500 en POST de preparación; UI CU-029 por editar ciudad antes de completar la
carga inicial del detalle. En su traza, esa carga terminó después de introducir
Medellín y volvió a establecer Bogotá antes del PUT: no fue una pérdida SQL de
una ciudad enviada correctamente. El test ahora espera encabezado/datos cargados,
fin de carga/subida y aviso de guardado, y exige que el PUT lleve Medellín antes
de recargar. Su primer intento posterior quedó **1/2** por 503 en GET sesión;
el siguiente pasó **2/2**, conservando ambos informes (`cu029-visible-4/5`).
Ese individual posterior no transforma el **10/13** ni elimina las trazas fallidas.

Diagnóstico observado: SQL QUERY_READ_TIMEOUT a las **06:29:19.120 UTC**; siete
pools con esperando=0 y Alimentos total=3/libres=1 (máximo 10), máximo del bucle
Node **29.611,79 ms** desde arranque/fallo anterior. **95 muestras** SQL, RTT
máximo respondido **2406,88 ms**, además de timeouts del observador a 3000 ms.
Presión de memoria de VM `full avg10` entre **1,67 % y 49,48 %**. No hubo error
DNS registrado en este último conjunto; los DNS confirmados anteriores siguen
abiertos. Las instantáneas no prueban agotamiento del pool, causa de pausas ni
causa única SQL/DNS. El timeout upstream y el 499 histórico conservan su
clasificación aparte. No se cambian plazos, reintentos, DNS ni recursos ajenos.

CU-013 integra ahora los pasos 1–12 al incorporar CU-014. B conserva demora/aviso;
C/D/E/F rechazan entrega prematura, cancelada, duplicada/punto incorrecto y QR
inválido; G usa versión, idempotencia e historial/entrega única. A sigue siendo
reporte/resolución conservadora: sustituciones, originar cancelaciones CU-011F y
coordinar devoluciones F12 permanecen pendientes. No se declara cerrado ese alcance.

Comandos por CU, automático/visible, conjunto y diagnóstico:
[guía E2E](../../App/e2e/README.md). Los logs de compilación, suites y fallos,
metadatos de imágenes y cámara se conservaron en `.evidencia/cu014-cierre/`;
QR, correos, sesiones, firmas y trazas siguen privados/ignorados. No se repitieron
semillas, borraron volúmenes ni cambiaron A/B. El entorno propio termina saludable,
demo COMPLETA. Siguiente etapa: investigar las pausas/SQL y DNS con estas evidencias,
coordinar CU-028 con Samuel y definir cancelación CU-011F/F12 con su dueño.

Imágenes finales verificadas: Núcleo `83ff515b95f7` / revisión `da4ba89`,
cliente `e925bc41bf80` / `da4ba89`, administración `3ea2d040d7ec` / `cc3e233`,
gateway `51f6c239bfc2` / `09b0199`; todas con fuente modificada=`no`.
Los commits posteriores a esas compilaciones cambian pruebas/documentación.
SHA-256 de los siete JavaScript ejecutados de entrega, recepción, preparación,
pagos, consulta Personal, historia central y migración CU-014 coincide con dist
local. Metadatos íntegros en `cu014-cierre/fuentes-imagenes-final.json`.
Los once servicios propios están saludables; solo la regresión propia quedó
parada, con sus datos conservados. A/B y recursos ajenos no se detuvieron.

Hitos de código/pruebas de esta entrega:
`f24f255` referencia/decisión; `516d7b0` backend/migración CU-014;
`da4ba89` portales/Flutter/escáner; `7f0e0e1` mensaje humano de rechazos;
`39be37a` cámara física e historia de migraciones; `1822efd` fixture CU-011
repetible; `cc3e233` demostraciones CU-014/027/029 y guías; `313f8e5` resolución
de intenciones y sincronización del recinto/observador. Publicación exclusiva
`origin/feature/sebastian`; no hay integración a develop/main ni importación de
parqueaderos de Samuel. El commit documental posterior registra este cierre.

## CU-013: hito 2, preparación y comprobaciones — 7 de noviembre de 2026

Se implementa solo preparación hasta listo, manteniendo CONFIRMADO y el QR de
CU-011. [Decisión y alcance de alternativos](../../App/backend/modulos/alimentos/recepcion/DECISION-CU013.md).
Acciones versionadas/idempotentes, historial y avisos SQL en la misma transacción;
incidencias con resolución conservadora y permisos por vínculo. Cliente recupera
sus pedidos y QR; las pantallas web/Flutter usan sondeos de 15 s, acotados a la
pantalla activa, sin solapamiento y pausados ante errores.

| Comprobación ejecutada CU-013 | Resultado |
|---|---|
| Backend tipos/build y pruebas completas con Redis real | **904/904, 63 suites**, sin omisiones; aplicaciones propias detenidas y PostgreSQL/Redis activos durante la suite; tipos/build aprobados |
| Recepción/preparación | **17/17**, incluidas transiciones, pago persistido, versiones, tiempos e idempotencia |
| Angular administrativo y cliente | **5/5** y **19/19**, compilaciones Docker de ambos aprobadas |
| Flutter analyze y tests nativos | Sin incidencias; **59/59**, concurrencia 1; versiones, respuesta perdida/replay, sondeo y detalle visible con 100 pedidos |
| Migración CU-013 vacía y actualización desde 27 | **2/2**, 28 migraciones, las 18 procedencias intactas y repetición sin DDL |
| Regresión migraciones CU-012 desde 26 y CU-015 desde 25 | **2/2 + 2/2**, aplicando hasta 28 sin modificar filas previas |
| Tipos Playwright, fronteras/configuración y guardas del entorno | Aprobados; guardas **11/11** |
| Regresión original CU-011 tras la navegación por páginas | **9/9**, repetida tras paginar: 6,01 s; proyecto de regresión detenido y volúmenes conservados |
| Playwright conjunto final, todos los procesos propios activos | **5/6**; falla login de API CU-013 por 503 SQL; pasan CU-013 visual y ambos CU-012/015 |
| API CU-013 individual posterior sobre la misma imagen final | **1/1**, 19,2 s; no equivale a conjunto 6/6 |

Las bases auxiliares conservadas incluyen `cu013_3bfbb78cf2b7_vacia/actualizacion`
y la repetición final `cu013_e83ced5abc59_vacia/actualizacion`,
`cu012_8af2ee48db3e_vacia/actualizacion` y `cu015_1c5fdc0e5d9b_vacia/actualizacion`.
El ensayo CU-013 conserva productos, reservas activas/consumidas, pedidos pendientes
y confirmados, pagos y detalles; el confirmado histórico se lee RECIBIDO/versión 0
y conserva su QR. Se comparan las filas completas anteriores; synchronize=false.

Fallos de unitarias conservados: con las aplicaciones propias activas, la primera
suite obtuvo 884/901 por timeouts Redis (17 fallos, dos suites). Al detener solo
Núcleo, la misma suite pasó 901/901. Tras añadir dos pruebas de diagnóstico SQL,
otra ejecución obtuvo 899/903 por cuatro timeouts Redis. Finalmente, con solo los
recursos propios PostgreSQL/Redis activos, pasó 903/903 en 16,07 s; tras la navegación por páginas volvió a pasar en 13,16 s. No se cambiaron
límites, reintentos ni aserciones. En el primer fallo se midió presión global de
memoria `full avg10=28,03 %`; Redis no registró conexiones rechazadas. Las diferencias
de carga se documentan sin atribuir por ellas una causa a cada timeout.

Primera ejecución conjunta ampliada: **3/6**, evidencia privada
`.evidencia/cu013-referencia-2026-11-07T19-35-54-386Z/`. Pasaron API CU-013 (incluido
reinicio real) y ambos CU-015. Los dos CU-012 recibieron HTTP 500 con `Query read
timeout` en consultas de productos/establecimientos/operaciones; no fueron 503 DNS.
El observador midió ida/vuelta SQL máxima 1963 ms y una espera de bloqueo de 269 ms,
sin evidencia suficiente para afirmar agotamiento del pool o consulta lenta.
La UI CU-013 falló por sincronización del test: recargó todavía en Menú antes de
completar la navegación. Se añadió la aserción de URL antes de recargar, conservando
las comprobaciones de QR y los plazos. Se añadió también recuperación mediante
un nuevo contexto y un nuevo inicio de sesión del cliente.

Para medir la recurrencia SQL, el filtro de Núcleo registra `FALLO_SQL` con los
contadores reales de sus siete pools, histograma del bucle Node y memoria al
manejar un QueryFailedError HTTP. No agrega SQL, no reintenta ni cambia el 500.
No registra parámetros ni sentencias en ese registro; los logs TypeORM y trazas
siguen privados. La instantánea del pool se toma al capturar el error y el
histograma cubre desde el arranque/fallo anterior: no demuestra por sí solo la
causa de una petición. Las muestras periódicas también pueden omitir picos.

La segunda conjunta obtuvo **4/6**, evidencia privada
`.evidencia/cu013-referencia-2026-11-07T19-54-14-999Z/`. Pasaron CU-012 API,
CU-013 visual (31,5 s, incluida sesión nueva) y ambos CU-015. La API CU-013 falló
por el fixture que reutilizaba `codigo_qr='fixture-sin-pago'`, incompatible con
la restricción única tras repetir el ensayo sobre datos conservados. Se corrigió
añadiendo el UUID del pedido; no se borran datos ni restricciones.

La UI CU-012 terminó con el PATCH de reactivación pendiente durante 15 s y 499 al
cerrar el contexto, sin error DNS que permita atribuirlo al 503 histórico. El test
ahora exige además la respuesta 200 de activación y la fila activa antes de recargar
el cliente; conserva todas las aserciones y plazos. Hubo también un timeout SQL
HTTP al cargar Menú a las 19:55:33 UTC: los siete pools registraron cero solicitudes
esperando y Alimentos tenía dos conexiones libres de dos abiertas (máximo 10).
El bucle Node registró máximo 18.236,83 ms desde el arranque. Las 34 muestras SQL
tuvieron RTT máximo 2572,23 ms, sin espera de bloqueo capturada. Memoria global
de VM `full avg10` entre 8,87 % y 50,45 %. Es evidencia de pausas del proceso y
presión observada; no basta para demostrar su origen ni descartar picos del pool.
El 503 DNS confirmado y el 499 histórico de Eventos conservan causas separadas.

Imágenes del diagnóstico verificadas: Núcleo `bc7c2b4` (`61fb5b987b0b`), ambos portales
`9dd3224` y gateway conservado `09b0199`. SHA-256 del JavaScript ejecutado de
preparación, recepción, ajustes, pagos y diagnóstico coincide con el dist local.
La mejora nativa de navegación está en `6a4b289`; la navegación por páginas
posterior está en `c196e1d` y se recompila en los tres componentes. No se resembró
ningún recurso.

La tercera conjunta obtuvo **4/6**, evidencia privada
`.evidencia/cu013-referencia-2026-11-07T19-59-20-430Z/`: pasaron ambas API y ambos
CU-015. CU-012 visual quedó esperando un ajuste, con POST sin respuesta en 15 s
antes de cerrar el contexto. CU-013 visual seleccionó el establecimiento todavía
en Menú, antes de finalizar la ruta a Preparación: la traza muestra las solicitudes
al menú nuevo y luego los sondeos al establecimiento inicial en la pantalla nueva.
Se añadió una aserción de URL al navegar a Preparación; no era evidencia de caída
SQL de esa bandeja. Por separado, a las 20:00:01 UTC hubo Query read timeout con
cero solicitudes esperando en los siete pools y pausa máxima Node de 13.371,44 ms.
No se atribuye el 499 a DNS sin resolución fallida registrada.

La revisión añadió páginas de 100 en las listas de Personal/Cliente, con botones
en ambos portales y Flutter. Un límite fijo sin navegación podía ocultar pedidos
históricos. El sondeo sigue acotado a la página activa; el detalle por ID se mantiene.
Angular comprueba navegación y reinicio de página al cambiar establecimiento;
Flutter comprueba avanzar/volver y el parámetro del contrato. El caso API real
comprueba recuperar el pedido original tras 100 filas propias de lectura (fixtures,
no nuevos cobros ni consumos) y rechaza páginas inválidas. No se resembró inventario.

Las imágenes nuevas de Núcleo (`7364a6f14b4f`), portal administrativo
(`31201b4c7210`) y cliente (`7e9ea421bfcd`) corresponden a `c196e1d`.
Los seis módulos JS revisados (controlador/recepción/preparación, ajustes, pagos y
diagnóstico) coinciden por SHA-256 con el dist local. Gateway conserva `09b0199`.
El arranque selectivo comprobó 28 migraciones sin reaplicar ninguna; demo COMPLETA.
Una guarda de arranque rechazó inicialmente 15459 ocupado: no se omitió, no se
actuó sobre otro proyecto; tras inspeccionar sin listener ni contenedor activo en
ese puerto, el mismo guion pasó sus comprobaciones y construyó en serie.

La cuarta conjunta sobre las imágenes de `c196e1d` obtuvo **4/6**, evidencia
`.evidencia/cu013-referencia-2026-11-07T20-13-20-876Z/`. Pasaron ambos CU-012 y
ambos CU-015. La UI CU-013 recorrió compra, pago y las cinco operaciones de
preparación con 200; falló después al volver a iniciar sesión en el contexto
nuevo: POST `/sesiones` pendiente durante 15 s, sin respuesta antes del cierre.
No se presenta esa prueba como aprobada ni se atribuye la falta de respuesta a DNS.
La API llegó a su fixture nuevo de 100 filas y falló por incluir `evento_id` en
Pedidos (pertenece al establecimiento). Se corrigió el fixture en `9cd1bff`, tras
consultar las columnas reales, sin cambiar tablas ni borrar datos.

La comparación con Boletería y Trabajador propios pausados también obtuvo
**4/6**, evidencia `.evidencia/cu013-referencia-2026-11-07T20-17-33-613Z/`.
Pasaron ambos CU-012 y ambos CU-015. La UI CU-013 inició preparación, pero el
sondeo del listado propio recibió **503 DNS confirmado**, `nucleo could not be
resolved (110: Operation timed out)` a las 20:18:45 UTC. La pantalla pausó
correctamente el sondeo; el test esperaba un detalle que ya no se consultaría.
Se amplió la detección del test para fallar de inmediato ante un error HTTP de
ese listado previo, sin reenviar solicitudes ni reducir aserciones.

La API recuperó el histórico tras las 100 filas, pero detectó `pagina=texto` con
200 en vez de 400. La conversión primitiva de ValidationPipe producía NaN y
DefaultValuePipe lo cambiaba a cero. `01d9d9e` retira ese valor por defecto del
pipe: solo ausencia es opcional, un texto inválido se rechaza; el servicio conserva
cero como página inicial. Tipos/build y 16/16 afectados pasaron después del cambio.
Los tres parámetros inválidos siguen exigidos en la integración.

Se restauraron Boletería y Trabajador saludables, sin reconstruir ni sembrar.
Los errores de resolución de Boletería del dashboard durante esa pausa eran
esperados y se distinguen del fallo de resolución de **Núcleo**, que seguía activo.
La comparación no demuestra la causa ni resuelve SQL/DNS/499. No se actúa sobre
recursos ajenos ni referencias A/B. Los resultados del ajuste posterior se
registran debajo.

La revisión de límites añadió `minutos:null`: la prueba nueva reprodujo que
IsOptional lo omitía (16 aprobadas, una fallida) y podía convertirse en cero
minutos al calcular la estimación. Se corrige el DTO para omitir solo undefined
y el servicio rechaza null/undefined cuando la acción exige minutos. El mismo
caso se exige como 400 en la integración real, conservando 1–240 como intervalo.
La imagen de Núcleo posterior es `b255758` (`3ecf3257c1d9`): controlador, DTO y
servicio corregidos coinciden por SHA-256 con el dist local. Los portales conservan
`c196e1d`. La suite completa posterior pasó **904/904**, 63 suites, en 15,6 s, con tipos,
build y tipos Playwright aprobados. La evidencia previa al arreglo queda en
`cu013-validaciones/` junto a las suites.

El conjunto más reciente sobre Núcleo `b255758`, ambos portales `c196e1d` y
**todos los procesos propios activos** terminó **5/6**; evidencia privada
`.evidencia/cu013-referencia-2026-11-07T20-28-26-099Z/`. Pasaron ambos CU-012,
CU-013 visual completo (35,2 s, cinco cambios, recarga y nuevo inicio de sesión
con el mismo QR/avisos) y ambos CU-015. La API CU-013 falló en el primer login,
antes de preparar: POST `/sesiones` 503. Núcleo registró a las 20:29:56 UTC
`PostgreSQL no disponible: canceling statement due to statement timeout`.
**Ese 503 es SQL; no hay fallo DNS registrado en esa ejecución.** No se declara
el conjunto verde. Las 29 muestras PostgreSQL tuvieron RTT mediano 11,84 ms y
máximo 2082,50 ms. Dos muestras de Alimentos con Lock/transactionid, de 896,91 y
712,12 ms, fueron anteriores al fallo de login; no prueban su causa. El plan del
sondeo tuvo ejecución máxima 247,886 ms y la presión de memoria de VM
`full avg10` osciló entre 5,25 % y 44,32 %. La capa Disponibilidad convierte el
fallo SQL del login a 503 antes del filtro QueryFailedError: en ese fallo no hay
instantánea del pool Node, y los datos de servidor no la sustituyen.

La API CU-013 posterior, **individual**, pasó **1/1** en 19,2 s sobre la misma
imagen final; evidencia privada
`.evidencia/cu013-api-cierre-2026-11-07T20-31-42-073146+00-00/`.
Comprueba páginas inválidas (incluido texto), minutos null, los 100 registros de
lectura, pago repetido preparando/listo con mismo libro/QR/stock, concurrencia,
historial/avisos sin duplicados, alcance y revocación, negativos financieros,
snapshots completos y estado/avisos/QR idénticos tras reiniciar Núcleo. No se
equipara esta prueba al conjunto: **el último conjunto permanece 5/6**.

Se cierra la preparación implementada con esa limitación de disponibilidad
conservada. SQL reproducido, DNS confirmado y 499 histórico sin causa determinada
siguen abiertos por separado; ni una repetición aprobada ni pausar procesos
propios acreditan que estén resueltos. No se elevaron timeouts, no se añadieron
reintentos generales ni se actuó sobre contenedores ajenos/A/B. El entorno propio
queda activo y saludable; datos, claves y volúmenes conservados, evidencias privadas.

No se declara CU-013 completo: entrega/validación única siguen en CU-014;
cancelación CU-011F y F12 no se implementan.

Commits de la etapa: `252bb8c` (referencia previa), `9dd3224` (preparación),
`6a4b289` (navegación nativa), `bc7c2b4` (diagnóstico SQL), `c196e1d` (históricos
por páginas), `9cd1bff` (fixture de lectura), `01d9d9e` (validación de página y
fallo del sondeo) y `b255758` (rechazo de minutos null). El cierre documental
posterior reúne esta evidencia. Destino exclusivo: `origin/feature/sebastian`;
sin integración a develop/main ni cambios al reparto CU-028/030–032.

## CU-013: hito 1, referencia previa — 7 de noviembre de 2026

Inicio en `89881094cf92c5c4cf7e9d86b1a06b564a05ce4b`, `feature/sebastian`
limpia y coincidente con origin. Todavía no se amplía preparación.

Se contrastaron las imágenes activas: Núcleo `5277fba` (imagen
`428ec444d0ca`), portales `64735e7` y gateway `09b0199`. SHA-256 del JavaScript
de ajustes, lecturas, checkout y pagos dentro de Núcleo coincide exactamente con
el dist local. Desde `5277fba` solo cambió documentación del backend: no se
atribuye la referencia a un binario distinto del código publicado.

La reproducción conjunta **CU-012/CU-015 pasó 4/4**, con un trabajador, cero
reintentos y los límites originales 120 s / 15 s. Es un conjunto aprobado real,
no una suma de ejecuciones individuales. Evidencia privada:
`.evidencia/cu013-referencia-2026-11-07T18-42-04-320Z/`.

El observador de solo lectura registra actividad PostgreSQL, bloqueantes,
duraciones, plan del sondeo, presión Linux de la VM, Docker y memoria del host;
conserva los logs propios correlacionados por tiempo. En esta reproducción:

- 24 muestras SQL: ida/vuelta mediana 17,78 ms y máxima 84,72 ms.
- Plan del sondeo de ajustes: ejecución PostgreSQL inferior a 0,4 ms;
  ida/vuelta mediana 7,62 ms y máxima 73,67 ms.
- Máximo 19 conexiones de todas las aplicaciones observadas; Alimentos 4 de su
  límite configurado 10. La observación de servidor **no mide waitingCount del
  pool Node**, ni permite descartar picos entre muestras.
- Una muestra con espera `Lock/transactionid`, 618 ms, y transacción máxima
  observada 685 ms. No hay evidencia aquí de un interbloqueo o espera de 3 s.
- Presión global de memoria de la VM: `full avg10` entre 6,85 % y 55,44 %;
  presión de E/S `full avg10` entre 7,82 % y 20,42 %. Son mediciones de espera,
  no una demostración de la causa de los fallos anteriores.

El sondeo de ajustes evita solapar sus propios ciclos, consulta como máximo
50 intenciones y no procesa una cola vacía. Las solicitudes y consultas de
operación también pueden procesar un establecimiento, serializadas por su bloqueo.
La carrera real con compra/pago, las lecturas y la expiración pasó en el conjunto.
El ensayo PostgreSQL/Redis de incertidumbre volvió a recuperar **cinco intenciones
tras reiniciar Núcleo**, incluidas reconexión/AOF, consumo/liberación pendientes
y SIGKILL, sin duplicar stock. No se reinició ni reconstruyó Redis.

CU-011 original pasó **9/9**, deteniendo antes únicamente el proyecto propio
y conservando sus volúmenes. Su proyecto de regresión quedó detenido al terminar. Los contenedores ajenos y referencias A/B no cambian.

Estado de incidentes: el timeout SQL anterior, el 503 DNS confirmado y el 499
siguen siendo tres observaciones distintas. En esta reproducción no se repitieron;
no se declara resuelta ninguna causa. No se identifica un defecto funcional nuevo
que autorice cambiar código por conjetura, ni se aumentan esperas/reintentos.
Con conjunto 4/4, recuperación y CU-011 9/9 existe una referencia comprobable
para iniciar el segundo hito. No hubo indisponibilidad persistente que obligue
a actuar sobre recursos ajenos. Las causas anteriores permanecen abiertas y se
vuelven a medir si reaparecen, sin interpretar este resultado como solución.

## Entrega CU-012 — 7 de noviembre de 2026

Se partió de `6c9772e866da268ce91e919f2a9c8972d0091903`, rama
`feature/sebastian` limpia y sincronizada. Se implementaron registro, consulta de
activos/inactivos, edición de nombre/descripción/precio/restricciones, activación
y ajustes de existencias. Precio decimal textual, duplicado normalizado por
establecimiento, validaciones y snapshots de pedidos conservados.

El diseño se escribió antes de modificar inventario:
[DECISION-CU012](../../App/backend/modulos/alimentos/inventario/DECISION-CU012.md).
Físico sigue siendo PostgreSQL; disponible es Redis y reservado físico es su
diferencia coordinada. Ante intención pendiente o lectura no fiable las cantidades
reservada/disponible son desconocidas. `cantidadInventario` conserva su significado
físico para compatibilidad. Consumos ya descontados y liberaciones pendientes se
tratan según el efecto realmente aplicado, sin contar únicamente reservas ACTIVA.

Cada alta/ajuste registra una intención SQL durable con UUID, actor, producto,
motivo, cantidades y resultado. Lua cambia un solo campo y guarda un resultado
idempotente, exige confirmación local AOF antes del cierre SQL y permite recuperar
la misma operación tras pérdida de respuesta o reinicio. La admisión de nuevos
checkouts se bloquea mientras haya una intención pendiente; pagos de pedidos
existentes conservan sus reglas y snapshots. No se afirma atomicidad SQL/Redis.
El primer producto queda vendible desde el flujo normal; otro producto no reinicia
las reservas ni los contadores existentes.

Personal activo requiere vínculo vigente y producto del establecimiento. La lista
privada incluye establecimientos cerrados. Web y Flutter permiten gestionar menú,
cantidades, historial y reanudar la intención conservando su UUID sin guardar
credenciales. El portal limita expresamente Personal a Menú, incluso por URL.
CU-015 permite consultar, buscar, asignar y revocar cuentas Personal existentes.

| Verificación ejecutada CU-012 | Resultado |
|---|---|
| Backend tipos y compilación | Aprobados |
| Unitarias con Redis real del entorno propio | **889/889, 61 suites**, ninguna omitida |
| Migración CU-012, vacía y actualización desde 26 con productos, reserva, pedido y detalle | **2/2**, 27 migraciones, 18 procedencias intactas y repetición sin DDL |
| Regresión migración CU-015, vacía y actualización desde 25 | **2/2**, 27 migraciones y todos los campos previos conservados |
| Fallos con PostgreSQL/Redis reales y reinicio de Núcleo | Aprobados: respuesta Redis perdida, AOF no confirmado, reconexión entre Lua y WAITAOF, confirmación SQL perdida, conexión Redis cerrada, liberación pendiente antes/después, consumo pendiente y SIGKILL; cinco intenciones recuperadas sin duplicar |
| Regresión original CU-011 | **9/9**, mismas aserciones; recursos de regresión detenidos y volúmenes conservados |
| Angular/Karma cliente y administrativo | **16/16** y **1/1**; administrativo repetido tras añadir búsqueda |
| Flutter analyze y pruebas nativas | Sin incidencias; **53/53** con concurrencia 1 |
| Verificador de infraestructura y fronteras | Aprobado |
| Guardas del entorno | **11/11** |
| Tipos Playwright | Aprobados |
| Builds finales selectivos de Núcleo y dos portales | Aprobados, sin recompilar Boletería/Trabajador |
| Playwright CU-012 automático | **2/2** en ejecución revisada; API repetida al cierre **1/1** (11,9 s), pago real y stock final correctos |
| Playwright CU-015 automático | **2/2** en las ejecuciones conjuntas inicial y posterior al incidente 499 |
| Playwright conjunto automático más reciente | **3/4**: falla CU-012 visual por 503 DNS confirmado; los otros tres pasan |
| Playwright conjunto visible (`test:alimentos -- --headed`) | **2/4**: pasan CU-012 visual completo y API CU-015; fallan API CU-012 y UI CU-015 por indisponibilidad SQL documentada, sin declarar el conjunto verde |

Las bases auxiliares conservadas son `cu012_0feeddcb2ea2_vacia/actualizacion` y
`cu015_36f0a225bdfd_vacia/actualizacion`, dentro del PostgreSQL aislado existente.
No se modificaron las 18 migraciones históricas ni se habilitó synchronize.
Los ensayos de fallo usan servicios reales y fallos controlados de transporte;
el consumo pendiente prepara una aprobación SQL como fixture para aislar ese punto.
El pago financiero integrado se comprueba por gateway en CU-011 y Playwright.

El primer recorrido visual encontró que una respuesta definitiva de duplicado
retenía la intención y bloqueaba el formulario. Se corrigió en web y Flutter:
400/409 definitivos permiten corregir; los fallos inciertos conservan UUID/petición.
La repetición CU-012 pasó **2/2**. La evidencia del fallo queda privada en
`App/e2e/.evidencia/cu012-fallo-inicial/`. No se eliminaron aserciones ni se
ampliaron reintentos/timeouts. La incidencia DNS Docker de CU-015 sigue abierta;
no se atribuyó a ella este defecto de interfaz.

La revisión añadió una guarda de generación de conexión: WAITAOF sobre una
sesión Redis nueva no confirma una escritura de la sesión anterior. La prueba
cierra/reabre realmente la conexión entre Lua y WAITAOF y exige PENDIENTE.
Una ejecución ampliada de recuperación se detuvo por `statement_timeout` de
PostgreSQL (3 s), incluso en una consulta sin bloqueo explícito. Se conservaron
log SQL y runner en `.evidencia/cu012-timeout-postgres/`. Al inspeccionar no había
transacciones bloqueantes y las intenciones ya se habían recuperado. Se observó
CPU alta en contenedores Redash ajenos y presión de memoria; son observaciones,
no una causa probada. No se tocaron esos recursos ni se ampliaron plazos.
La repetición completa pasó con los mismos límites y todas las aserciones.

La primera ejecución conjunta dio **3/4**: CU-012 visual y los dos recorridos
CU-015 pasaron; la prueba de dos ajustes esperaba 200/409 inmediatos, pero recibió
dos 202. Se conservaron informe/traza en `.evidencia/cu012-concurrencia-pendiente/`.
La inspección SQL/Redis confirmó una aplicada, otra rechazada y stock 5/5. La prueba
se amplió para seguir una respuesta PENDIENTE por el mismo UUID, conservando la
exigencia final de una aplicada/otra rechazada y añadiendo producto/delta y las
cantidades 5/0/5. No reenvía POST, no crea otra clave, ni repite errores de HTTP o
transporte; un 503 DNS falla. Usa el límite de sondeo existente, sin ampliarlo.
En la segunda ejecución pasaron ambos CU-012 y la API CU-015; la interfaz CU-015
agotó 120 s al seleccionar un evento después de fallar su carga. El gateway
registró `GET /api/v1/eventos` 499 al cancelar el cliente, además de dos consultas
del dashboard canceladas. No hay un 503 ni un error de resolución que permita
atribuirlo al incidente DNS anterior. Informe, captura, traza y logs propios se
conservan en `.evidencia/cu015-eventos-499/`; no se cambia la API de Eventos ni
se elevan plazos. La causa de esta interrupción queda sin confirmar.
La siguiente ejecución volvió a aprobar la API CU-012 y ambos CU-015, pero falló
la interfaz CU-012. En este caso sí se confirmó DNS: el 7/11 a las 05:37:48
America/Bogota, gateway devolvió 503 al alta adicional y registró
`nucleo could not be resolved (110: Operation timed out)`. La interfaz retuvo UUID
y petición; no inventó un ajuste confirmado. Se conservan traza/capturas y logs
en `.evidencia/cu012-dns-503/`. Se añadió una aserción explícita de la respuesta
al alta adicional, del estado aplicado y del producto distinto, antes de continuar
editando; así un error de transporte falla en su origen y no esperando un control
bloqueado. No se cambió DNS ni se declaró resuelto el incidente.

La demostración visible ejecutó los cuatro casos, **2/4**: el flujo completo de
menú CU-012 pasó con el alta adicional comprobada; la API CU-015 también. La API
CU-012 recibió 500 al iniciar el pago: los logs muestran `Query read timeout`
en `START TRANSACTION` de ajuste y en SELECT del intento de pago, antes de cobrar,
sin evidencia de interbloqueo. La UI CU-015 falló al volver a consultar catálogo;
Núcleo registró PostgreSQL no disponible y hubo timeout al renovar sesión.
Se conserva todo en `.evidencia/cu012-visible-incidentes/`. No se atribuye ese
500 al DNS ni se cambia F12 o se acepta 500 como resultado de negocio.
Una comprobación específica posterior de la API CU-012, sin navegador y sin
cambiar código/timeouts, pasó **1/1** con pago 200 y confirmado, ajuste concurrente,
expiración y existencias 9/0/9. Comando: `npm run test:cu012 -- --grep 'API real'`.
Estas repeticiones no certifican estabilidad: DNS y los timeouts SQL siguen abiertos.


Se reutiliza `hexacore-cu015-sebastian`, sus claves, volúmenes y datos. Los builds
se limitan a Núcleo y portales, Angular usa un trabajador y las tareas pesadas se
ejecutan en serie. No se resembra, reconstruye Redis ni cambia ningún entorno
habitual o referencia A/B. Comandos y demostración:
[App/e2e/README](../../App/e2e/README.md).

Límites: los ajustes requieren Redis >=7.2 con AOF activo; WAITAOF acredita disco
local, no tolerancia a pérdida total de almacenamiento. Esa pérdida/corrupción
requiere restauración del dueño, nunca una reconstrucción automática. La intención
pendiente puede reducir disponibilidad de nuevos pedidos mientras se recupera.
Flutter se verificó por análisis y tests, sin afirmar ejecución en dispositivo físico.
El entorno terminó con todos sus servicios saludables y preparación `Exited (0)`;
los recursos de regresión están detenidos. Ese estado puntual no resuelve las
interrupciones DNS/SQL observadas ni certifica disponibilidad productiva.
No se completan CU-013/014, CU-028, F12 ni políticas automáticas de cancelación/reembolso.

**Siguiente encargo: preparación CU-013.** Partir de pedidos confirmados y del
vínculo privado de Personal; completar estados/transiciones de preparación, tiempo
estimado y avisos según la ficha vigente, conservando pagos y snapshots. Definir
el tratamiento de pedidos cancelados con su dueño, sin anticipar entrega única
CU-014. Repetir CU-011/012/015 y demostrar la recepción/preparación real.

### Hitos CU-012 y publicación

- `12f5044`: diseño previo y alcance de cantidades/estados/recuperación.
- `3676655`: productos, contratos, migración, autorización y coordinación durable.
- `64735e7`: interfaces web/Flutter, Personal CU-015 y demostración integrada.
- `5277fba`: impedir que una reconexión confirme el offset de otra sesión Redis.
- `a6e5910`: concurrencia con resolución de 202 por el mismo UUID y aserciones del alta adicional.

Publicación exclusiva en `origin/feature/sebastian`; este cierre documental se
publica en la misma rama. Sin integración a develop/main. Antes de publicar,
la referencia remota seguía en `6c9772e866da268ce91e919f2a9c8972d0091903`.
Las últimas imágenes de código corresponden a Núcleo `5277fba` y portales
`64735e7`; los commits posteriores cambian pruebas y documentación.
Núcleo conserva la marca `fuente.modificada=si` porque se estaba cerrando su
nota DECISION-CU012 durante la compilación; el TypeScript demostrado coincide
con `5277fba`. Los portales tienen `fuente.modificada=no`.
No se publican claves, sesiones, informes o trazas privadas.

## Antecedente: entrega CU-015

Las secciones siguientes conservan la evidencia de la entrega anterior; sus
conteos y commits corresponden a CU-015. El resultado vigente CU-012 está arriba.

Revisión inicial: 7 de noviembre de 2026 (America/Bogota). Rama
`feature/sebastian`, limpia en `a2e85d5517b8cee02a83df508dd9784fbff9de28`,
coincidente con origin antes de editar. ADR-16 conserva módulos y preparación
central; no autoriza el corte de las bases habituales.

| CU | Implementación encontrada | Comportamiento comprobado en esta entrega | Pendiente |
|---|---|---|---|
| 011 | Catálogo, checkout, reserva Redis, pagos, confirmación y QR | 9/9 pruebas originales de integración, más compra real con QR en Playwright | F12 y cancelación del establecimiento CU-011F siguen pendientes; no se resuelven al deshabilitar |
| 012 | Consulta de menú y activación de productos | Playwright real: 403 sin vínculo, 200 al asignar cuenta Personal, 403 al revocar | CRUD completo, precios, restricciones e inventario coordinado con reservas |
| 013 | Recepción de confirmados, solo lectura | Recepción real 200 solo con vínculo; unitarias y guarda por cuenta/establecimiento | Preparación, tiempos, transiciones y avisos |
| 014 | QR de pedido generado por 011 | Se generó y mostró el QR real de CU-011; no certifica entrega | Validación, entrega única y registro durable |
| 015 | API administrativa, migración aditiva, contacto/horario/zona/estado, catálogo y checkout con Eventos vigente, portal real | Playwright 2/2, unitarias, migración vacía/actualización y regresión 011 aprobadas | Sin pendientes funcionales de CU-015; límites operativos descritos abajo |

Orden: **CU-015 completado** → CU-012 → CU-013 → CU-014; mantener regresión CU-011
en cada etapa. La columna de comprobaciones contiene solo resultados ejecutados y distingue código presente de comportamiento probado.

## Alcance y acuerdos

- CU-015 vigente es **Gestionar establecimientos de alimentos** (SRS, flujo
  básico y alternativos A/B/C y excepción D). Las referencias antiguas a cancelaciones/reembolsos
  no crean otro CU. CU-011F y los requisitos de pedidos cancelados de CU-013/014
  se conservan como pendientes de reglas/transiciones de negocio.
- Acuerdo verificable: `git show 5950dea54c3dcafd20fe215ee392008a4663fa30:App/services/administracion/README.md`,
  líneas 16–17: CU-027 y CU-028 los implementa Samuel por acuerdo del equipo.
  CU-027 tiene cuentas, sesiones, recuperación, renovación/revocación y portal;
  reutilizarlos. CU-028 mantiene roles estáticos y guardas; permisos dinámicos
  son dependencia pendiente de Samuel, no parte de esta entrega.
- CU-029 implementado por Samuel: módulo Eventos/Recintos, migraciones, pantallas
  y pruebas existentes. Reutilizar la fuente de eventos CU-026 y revisar su API,
  sin rehacer CU-029. CU-030–032 no se reasignan a Sebastián.
- Sebastián lidera la validación de Seguridad RNF-05/06; los resultados aquí son
  evidencia acotada, no certificación global. Documenta pantallas/navegación de
  Alimentos para Usabilidad; Daniel consolida el atributo.

## Entorno y decisiones por verificar

Docker estaba detenido; se inició y se inventariaron los recursos. Existen el
entorno habitual, revisión de arquitectura y referencias A/B. Se conservarán:
CU-015 tendrá proyecto, volúmenes, red, claves, cookies y puertos propios.
Las tareas pesadas se ejecutan secuencialmente (Mac M2, 8 GB).

Horario diario con horas locales y zona IANA explícita (`America/Bogota` inicial),
cruce de medianoche y límites documentados. El estado y horario se consultan al
crear pedidos nuevos; nunca cancelan ni reembolsan pedidos anteriores.
La existencia/disponibilidad de eventos se obtiene por interfaz del dueño vigente,
sin considerar la proyección histórica de Alimentos como autoridad.

Las cuentas de Personal se reutilizarán mediante un vínculo persistente
cuenta–establecimiento. El rol Personal por sí solo no concederá acceso global.
Esto no implementa el sistema general de permisos dinámicos CU-028.

## Hitos

1. Revisión, trazabilidad y plan (este documento).
2. Backend CU-015, migración aditiva, frontera Eventos y autorización.
3. Portal administrativo y entorno aislado reproducible.
4. Playwright TypeScript con gateway/portales reales, regresión y publicación
   exclusiva en `origin/feature/sebastian`.

Los comandos, resultados, fallos previos, limitaciones y commits se registrarán
al verificar cada hito. El archivo respaldado `publicador-pedidos.service.ts`
fuera del repositorio se conserva allí y no se reincorpora.

## Resultado ejecutado — 7 de noviembre de 2026

Comandos completos: [guía reproducible](../../App/e2e/README.md).
Host de pruebas Node **22.22.3**, compiladores Angular propios del portal,
Playwright Test **1.65.0**, Chromium **158.0.8127.18**, un trabajador.

| Comprobación ejecutada | Resultado |
|---|---|
| Backend `npm run lint` y `npm run build` | Aprobados |
| Builds Docker secuenciales Núcleo/Boletería/Trabajador, gateway y portales | Aprobados; sin sustituir destinos habituales |
| Portal administrativo `npm run build` | Aprobado |
| Angular/Karma ChromeHeadless 157, cliente y administrativo | **16/16** (incluye CU-011) y **1/1** |
| `npm run tipos` en App/e2e | Aprobado |
| Unitarias con Redis real propio (`REDIS_PUERTO=16404`, opt-in Redis inventario) | **856/856, 59 suites**, sin omitidas |
| `npm run test:cu015:migracion` | **2/2**: instalación vacía y actualización; 26 migraciones, 18 procedencias conservadas, repetición sin DDL |
| `npm run test:cu015:regresion` | **9/9 CU-011 originales**, sin eliminar aserciones; otro proyecto propio, detenido al terminar |
| `npm run verificar:infra` | Configuraciones vigentes y fronteras aprobadas; se registran solo las API públicas nuevas |
| `python3 -m unittest discover -s App/infra/revision` | **11/11** guardas de propiedad, puertos, destinos, semillas y cierre |
| `npm run test:cu015` | **2/2** recorridos integrados sin mocks, gateway y backend directo |
| `npm run test:cu015:visible`, repetición sin cambios tras el incidente DNS | **2/2** con navegador abierto; no acredita que DNS esté corregido |

La actualización se probó en `cu015_2f8300c4cdc3_actualizacion`, creada únicamente
para este ensayo en el PostgreSQL CU-015. Se conservaron exactamente los campos
anteriores del establecimiento, el pedido confirmado, el producto y su detalle.
La base vacía fue `cu015_2f8300c4cdc3_vacia`. Ambas quedaron disponibles para
inspección; no se usaron bases habituales ni las referencias A/B.
Después de parar/reiniciar el entorno CU-015 se comprobaron el establecimiento
editado, su horario UTC y el pedido confirmado anterior; la carga continuó
`COMPLETA`, sin semillas ni migraciones reaplicadas.

Playwright creó eventos propios mediante CU-026/029, registró y editó por el
portal, comprobó recarga y validaciones, deshabilitó y habilitó, cambió horario/zona
al periodo cerrado y comprobó catálogo y rechazo real de checkout. Antes compró
un producto propio mediante Redis/Pagos/pasarela y mostró su QR; tras el cierre
comparó **toda la fila del pedido confirmado**, sin cambios, y stock físico 4 de 5.
La prueba de API comprobó Organizador/Administrador, 401/403 en Núcleo y gateway,
duplicado concurrente (201/409), evento inexistente, cancelación del evento en la
fuente vigente y vínculo/revocación de Personal. No declara completados CU-012–014.

La regresión original conserva 9 escenarios: login/perfil, checkout
con reserva atómica, rechazo de sobre-reserva, pago rechazado, pago aprobado con
mensajería, repetición idempotente, renovación/cookie HttpOnly, cierre/revocación
y SIGTERM sin conexiones abandonadas. El runner conserva los recursos propios
`hexacore-cu015-regresion`; no inicia ni cambia los proyectos de referencia.

## Incidencias encontradas y corregidas

- Arranque integrado detectó una exportación Nest faltante en la nueva guarda de
  Personal. Se corrigió y el arranque real y acceso integrado pasaron. La carga
  inicial se detuvo con `EN_CURSO`, como exige la guarda. Se verificaron 12 cuentas,
  3 establecimientos, 12 productos, cero pedidos, 9 eventos y las tres marcas/stock
  Redis (4 productos por punto). Se marcó únicamente esa carga propia como
  `DATOS_VERIFICADOS`, se arrancaron apps sin semillas y se completó la fase
  idempotente de Logística (5 empleados, 1 turno). Quedó `COMPLETA`. No se repitieron
  semillas SQL/Redis ni se sobreescribieron existencias. El arranque fresco con el
  código corregido sigue usando el flujo único normal; no se añadió un bypass.
- Playwright detectó dos enlaces válidos «Establecimientos» en el dashboard/menú.
  Se acotó el selector al elemento de navegación. Los intentos fallidos y su traza
  se conservan en `.evidencia/fallo-inicial-selector/`, privada e ignorada por Git.
- La comprobación de fronteras rechazó el nuevo import de Identidad: se amplió la
  lista únicamente para `consulta-personal.module` y se añadió la restricción de
  Alimentos a `consulta-eventos.module`, manteniendo la prohibición de internals.
- Se detectó que `RequisitosCasosUso.tex` es generado. Las correcciones se llevaron
  a su fuente `CU_eventos_completo.xlsx` y se regeneraron los **32 CU**: exactamente
  ocho celdas modificadas, solo CU-011/CU-015. La etiqueta no reconocida de excepción
  ocultaba CU-015D en el LaTeX; se normalizó y se recuperó el requisito de conservar
  pedidos activos al deshabilitar. Los requisitos de cancelación/reembolso no se
  eliminaron ni se convirtió su referencia antigua en un caso adicional.

Una repetición visible posterior al reinicio recibió 503 en el primer login.
El log del gateway identifica la causa: `nucleo could not be resolved (110:
Operation timed out)` (7/11, 03:53:52 America/Bogota), sin petición recibida por
Núcleo. La segunda prueba entró y pasó. Se conserva la traza privada en
`.evidencia/fallo-login-503/`; no se modifica DNS/timeouts ni se añaden reintentos
para ocultarlo. Es una incidencia observada del entorno Docker; no se demuestra
que sea F13 ni un defecto previo/introducido en Alimentos.

No se atribuyen los errores nuevos de código o selectores a la línea base. No se omitieron pruebas
ni aserciones para obtener los resultados aprobados.

## Límites y siguiente encargo

- RNF-05/06: evidencia concreta de validación, RS256/roles/revocación, rechazo de
  acceso directo y alcance del Personal. No sustituye auditoría global, medición
  de carga, TLS productivo ni los permisos dinámicos CU-028 pendientes de Samuel.
- La administración de cuentas, sesiones y CU-029 existentes se reutiliza. No se
  reimplementan CU-030–032 ni se cambia el reparto del equipo.
- Los cierres bloquean pedidos nuevos, no pagos de checkouts ya creados ni pedidos
  confirmados. F12, avisos, preparación, entrega única y políticas de cancelación
  siguen con sus CU/dueños; no hay reembolsos automáticos.
- Nuevos establecimientos sin productos tienen catálogo vacío. El único producto
  de Playwright es fixture propio para demostrar disponibilidad y regresión; no
  entrega el CRUD de productos/inventario de CU-012.
- Datos históricos reciben horario 24 h y contacto pendiente. Duplicados previos
  ambiguos bloquean la migración transaccionalmente para revisión de su dueño;
  no se borran/renombran. Una referencia antigua sin evento en la autoridad no
  habilita pedidos. El sistema no inventa esos eventos durante la migración.
- Pruebas/demos conservan datos propios y crecen al repetirse. No se publica
  `.estado-cu015`, tokens, contraseñas, sesiones, informes con cabeceras ni trazas.
  El respaldo externo de `publicador-pedidos.service.ts` no se tocó.

**Encargo posterior a aquella entrega (cumplido arriba como CU-012):** completar productos (nombre, descripción, precio,
restricciones, estado) e inventario con su trazabilidad y coordinación con reservas
activas Redis. Añadir la selección/asignación de cuentas Personal desde la interfaz
usando el vínculo local ya probado. Mantener los pedidos/snapshots anteriores y
repetir CU-011/CU-015; después abordar preparación CU-013 y entrega única CU-014.

## Commits y publicación

- `6564958`: revisión, plan inicial y trazabilidad.
- `91550ff`: backend CU-015, migración, interfaces explícitas, acceso acotado y pruebas.
- `09b0199`: portal, entorno, Playwright, fuente Excel/SRS y cierre documental.

Los tres hitos se publicaron exclusivamente en `origin/feature/sebastian`.
`git ls-remote origin refs/heads/feature/sebastian` confirmó
`09b0199601d1fe87aefab69c5b2e7c0d8afc9603`, coincidente con HEAD funcional.
No se integró a develop/main. Este cierre de evidencia documental se publica
en la misma rama; no modifica el código demostrado.

Arranque final desde el hito funcional limpio: las imágenes quedaron etiquetadas
con `org.opencontainers.image.revision=09b0199601d1fe87aefab69c5b2e7c0d8afc9603`
y `hexacore.fuente.modificada=no`. Núcleo, Boletería, Trabajador, gateway y ambos
portales quedaron saludables; carga demo `COMPLETA`, sin repetir semillas.
