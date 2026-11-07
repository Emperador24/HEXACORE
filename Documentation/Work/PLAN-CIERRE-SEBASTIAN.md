# Cierre de Alimentos — Sebastián

## CU-013: hito 2, preparación en validación

Se implementa solo preparación hasta listo, manteniendo CONFIRMADO y el QR de
CU-011. [Decisión y alcance de alternativos](../../App/backend/modulos/alimentos/recepcion/DECISION-CU013.md).
Acciones versionadas/idempotentes, historial y avisos SQL en la misma transacción;
incidencias con resolución conservadora y permisos por vínculo. Cliente recupera
sus pedidos y QR; las pantallas web/Flutter usan sondeos de 15 s, acotados a la
pantalla activa, sin solapamiento y pausados ante errores.

Comprobado hasta ahora: backend tipos/build y 16 pruebas de recepción; Angular
admin 4/4 y cliente 18/18; Flutter analyze sin incidencias y 56/56. Migración
aditiva registrada como número 28, con 18 procedencias congeladas. Falta comprobar
vacía/actualización, suite completa y recorridos integrados sobre imágenes nuevas.
No se declara CU-013 completo: entrega/validación única siguen en CU-014;
cancelación CU-011F y F12 no se implementan.

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
