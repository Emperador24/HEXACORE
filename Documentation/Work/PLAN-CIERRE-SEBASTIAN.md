# Cierre de Alimentos — Sebastián

## CU-014 y demostraciones CU-027/029 — 8 de noviembre de 2026, en validación

Base publicada comprobada: `db6f053d7e7259ad39684d26f085744afbbd0e24`,
`feature/sebastian` limpia y sincronizada al comenzar. Se conserva el entorno
CU-015 y todo recurso ajeno/A/B. No se integran develop ni cambios de parqueaderos.

Fuentes en ejecución: Núcleo `b255758` (`3ecf3257c1d9`), portales `c196e1d`
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
volúmenes conservados. Queda ejecutar el conjunto final de trece, sin sumar ejecuciones individuales.
CU-014 visible pasó **3/3** dentro de un conjunto nuevo **5/7**; CU-027 visible
pasó después **2/2** dentro de **3/4**, y CU-029 visible final **2/2**, 24,4 s.
Los fallos nuevos de demostración fueron del test: navegación antes de consumir
la respuesta de logout (traza DELETE abortada), zona inicial no contabilizada y
DTO de recinto anidado interpretado como objeto raíz. Se esperan respuesta/estado real,
se seleccionan zonas por nombre tras ordenarlas el servidor y se consulta
`recinto.zonas`; no se cambia el producto para acomodar la demostración.
Evidencias: `.evidencia/cu014-027-029-visible-1/`,
`cu027-029-visible-2/` y `cu029-visible-3/`.
La repetición CU-014 de migraciones **2/2** (`cu014_73b97190d668`) exige además
**80 tablas y 33 filas**: 29 historiales y cuatro roles, cero negocio.
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
