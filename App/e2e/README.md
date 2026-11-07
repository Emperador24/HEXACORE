# Demostración integrada de Alimentos: CU-012 y CU-015

## CU-012: menú e inventario, sobre el mismo entorno

No crear otro sistema ni repetir semillas. Desde la raíz de `feature/sebastian`,
con Docker local activo y los recursos de CU-015 conservados:

```bash
./App/infra/cu015.sh iniciar --compilar nucleo portal-web-admin portal-web-cliente
```

`--compilar` construye únicamente los componentes indicados, en serie. Los
Dockerfiles de Angular limitan también el compilador a un trabajador para el Mac
de 8 GB. Se reutilizan PostgreSQL, Redis AOF, broker, claves, volúmenes, puertos y
cuentas existentes. No hay preparación manual del inventario para CU-012.

Con Node 22.22.3 y las dependencias instaladas, desde `App/e2e`, definir localmente
`CU015_CLAVE_DEMO` como en la guía inferior y ejecutar:

```bash
npm run tipos
npm run test:cu012
npm run test:cu012:visible
npm run test:cu015
npm run test:alimentos       # ambos CU, un trabajador y cero reintentos
npm run informe
```

Recorrido real: Organizador → Establecimientos → Personal → cuenta existente →
buscar por nombre/correo y asignar. Personal entra al portal y accede solo a `/admin/menu`; cuentas, roles,
eventos y las otras secciones se rechazan también por URL directa. Consulta sus
establecimientos vinculados, incluidos cerrados, crea el primer producto con
existencias y restricciones, edita y activa/desactiva. Cliente ve el catálogo,
reserva, el personal prueba una reducción insegura y añade stock, incorpora otro
producto sin alterar la reserva, cambia precio/datos y desactiva el primero.
El cliente paga al precio acordado; el pedido conserva sus snapshots. Se comprueba
físico/reservado/disponible, reactivación y revocación del vínculo.

La prueba API comprueba 401/403 por gateway y Núcleo, producto de otro
establecimiento, duplicados y límites, idempotencia, dos reducciones concurrentes,
ajuste junto a compra/pago y expiración real de una reserva. Los dos ajustes
concurrentes deben terminar en uno APLICADA y otro RECHAZADA, con físico/disponible
5 de 20. Si una respuesta es 202, se exige PENDIENTE y se consulta esa misma
operación por UUID hasta su resolución; no se reenvía POST ni se genera otra clave.
Una respuesta HTTP distinta de 200 en la consulta o un error de transporte hace
fallar la prueba, incluido un 503 DNS; el sondeo usa el límite existente de 15 s.
En la carrera entre
checkout y una intención administrativa se admiten solo dos resultados: 201, o
409 **AJUSTE_INVENTARIO_PENDIENTE** sin pedido insertado. Tras comprobar ese rechazo
definitivo y la operación terminada, se crea el pedido. No se acepta un 503 DNS como
resultado de negocio ni se añaden reintentos para ocultarlo.

Desde `App/backend`, en serie:

```bash
npm run lint
npm run build
npm run test:cu012:migracion
npm run test:cu012:recuperacion
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16404 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16404 npm test -- --runInBand
npm run verificar:infra
```

La migración prueba instalación vacía y actualización desde las 26 migraciones
anteriores, con producto, reserva ACTIVA, pedido, detalle y establecimiento propios.
Compara todos los campos previos, nuevos defaults, repetición sin DDL y las 18
procedencias. Solo crea bases auxiliares en el PostgreSQL existente de CU-015;
no crea otra copia del sistema ni usa las referencias A/B.

Recuperación detiene **solo el Núcleo propio**, conserva Redis y sus datos y
prueba: respuesta Lua perdida después de aplicar, AOF local no confirmado, confirmación SQL perdida,
conexión Redis interrumpida, reconexión entre Lua y WAITAOF, LIBERACION_PENDIENTE antes/después de devolver unidades,
CONSUMO_PENDIENTE ya descontado y un proceso hijo terminado con SIGKILL entre la
intención y Lua. Reinicia el Núcleo real y verifica que su sondeo recupere cinco
intenciones sin doble ajuste. Los puntos de fallo usan PostgreSQL/Redis reales
y fallos de transporte controlados; el escenario de consumo prepara una aprobación
SQL como fixture para aislar ese punto, no certifica una pasarela mediante un doble.
El pago integrado y su libro real se prueban por gateway en Playwright y CU-011.

Los ajustes nuevos exigen Redis >=7.2, AOF activo y confirmación local WAITAOF antes
de confirmar físico en SQL. La intención pendiente bloquea admisión, y el replay
usa el mismo UUID. No hay transacción atómica entre SQL/Redis ni reconstrucción
automática ante pérdida/corrupción de su almacenamiento. Detalle de estados y
fallos: [DECISION-CU012](../backend/modulos/alimentos/inventario/DECISION-CU012.md).

Flutter nativo, desde `App/frontend/app-movil`:

```bash
flutter analyze
flutter test --concurrency=1
```

Se prueba el contrato común, formularios, precio como texto, cantidades,
persistencia de la intención sin credenciales y repetición con el mismo UUID.
Estos tests no se sustituyen por Playwright; no se afirma una prueba en dispositivo
físico a partir de tests de widgets. La app ofrece Menú a Personal y deja al backend
comprobar su vínculo, sin usar el catálogo público como lista de autorizaciones.

Repetir también las nueve pruebas originales CU-011 con
`npm run test:cu015:regresion`, usando **su proyecto de regresión ya existente**
como se explica debajo, y volver a iniciar el entorno CU-015 sin semillas.
Informes y trazas permanecen privados bajo `.evidencia/`. El primer fallo visual
CU-012 y su traza se conservaron en `.evidencia/cu012-fallo-inicial/`.
Una ejecución conjunta obtuvo 3/4: la aserción inicial de concurrencia exigía
200/409 inmediatos y recibió dos 202. Se conservaron informe y trazas en
`.evidencia/cu012-concurrencia-pendiente/`; SQL/Redis terminaron correctamente en
5/5, con una operación aplicada y otra rechazada. La prueba ahora comprueba ambos
caminos del contrato y conserva esa exigencia final, añadiendo producto/delta y
las tres cantidades. No se aumentan timeouts ni reintentos. El timeout SQL observado
en recuperación se conserva en `.evidencia/cu012-timeout-postgres/` y no se atribuye
al DNS ni se declara corregido a partir de una repetición aprobada.
La segunda ejecución aprobó CU-012 2/2 y la API CU-015, pero la interfaz CU-015
no pudo cargar Eventos (cancelación de cliente, 499 en gateway). Su evidencia
está en `.evidencia/cu015-eventos-499/`. No hay un 503 DNS probado en ese intento;
no se modifica la implementación de Eventos ni los plazos para ocultarlo.
Otra ejecución volvió a aprobar la API CU-012 y ambos CU-015, y detectó el DNS
conocido al crear el producto adicional: gateway 503 y `nucleo could not be resolved
(110: Operation timed out)`, 7/11 05:37:48 America/Bogota. Evidencia privada en
`.evidencia/cu012-dns-503/`. La interfaz conservó su intención. El test ahora
comprueba explícitamente la respuesta del alta adicional antes de seguir editando.
Para ejecutar los cuatro recorridos con navegador visible: `npm run test:alimentos -- --headed`.
Resultados CU-012 ejecutados: backend **889/889 (61 suites)**, Angular **16/16 y
1/1**, Flutter analyze sin incidencias y **53/53**, migración CU-012 **2/2** más
regresión migración CU-015 **2/2**, recuperación de cinco intenciones tras reinicio,
y CU-011 original **9/9**. CU-012 automático pasó **2/2** y CU-015 automático **2/2**
en las ejecuciones documentadas. La última conjunta automática dio **3/4** por
DNS; la visible (`test:alimentos -- --headed`) dio **2/4**, aprobando el recorrido
visual completo CU-012 y la API CU-015. La API CU-012 y la interfaz CU-015 fallaron
con timeouts SQL; evidencia en `.evidencia/cu012-visible-incidentes/`. No se declara
ese conjunto verde. La API CU-012 se comprobó después sin navegador con
`npm run test:cu012 -- --grep 'API real'`: **1/1**, pago 200 confirmado y stock 9/0/9,
sin cambios de código/plazos. DNS y los timeouts SQL siguen abiertos.
Resultados ejecutados y limitaciones actuales: [plan de cierre](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

Desde `feature/sebastian`, después de revisar `git status --short --branch`.
Requiere Docker local y Node 22.22.3 para las pruebas. Los builds pesados y las
suites se ejecutan en serie; Playwright usa un trabajador y no reintenta fallos.

Desde la raíz:

```bash
./App/infra/cu015.sh iniciar --datos-demo   # solo primera carga, sobre recursos nuevos vacíos
./App/infra/cu015.sh estado
```

Siguientes arranques: `./App/infra/cu015.sh iniciar`, sin semillas. Detener con
`./App/infra/cu015.sh parar` conserva contenedores y volúmenes. Reutiliza el
preparador central, los Dockerfiles y las guardas de revisión; no reutiliza los
datos de la revisión de arquitectura ni de las referencias A/B.

| Recurso propio | Destino |
|---|---|
| Proyecto, imágenes, volúmenes y red | `hexacore-cu015-sebastian` (prefijo) |
| Portal administrativo | http://cu015.localhost:14221/admin/establecimientos |
| Portal cliente | http://cu015.localhost:14220/pedidos |
| Gateway | http://cu015.localhost:18100/api/v1 |
| Núcleo, prueba directa de autorización | `127.0.0.1:13149` |
| PostgreSQL | `127.0.0.1:15459`, base `hexacore_cu015` |
| Redis | `127.0.0.1:16404` |
| AMQP / consola | `127.0.0.1:15699` / `:16799` |
| Boletería / Trabajador / pasarela / correo | `:13147` / `:13140` / `:13139` / `:13138` |
| Claves, bloqueo y configuración privados | `App/infra/revision/.estado-cu015/`, ignorado por Git |

Los puertos son solo loopback. Las cookies de `cu015.localhost` quedan separadas
de `revision.localhost` y `localhost`. Portales administrativo y cliente usan
contextos de navegador independientes. Se verifican rama, checkout propietario,
redes, volúmenes, montajes, SQL, Redis, broker, proveedores y puertos antes de actuar.
Una carga parcial `EN_CURSO` bloquea escritores; no se repiten semillas sobre ella.

## Navegador visible y ejecución automática

Desde `App/e2e`, con las cuentas demo existentes de Identidad y su contraseña
indicada en la [guía de revisión](../infra/revision/README.md). La contraseña se
lee localmente; no guardar tokens, contraseñas ni storageState en el repositorio.

```bash
npm ci
npx playwright install chromium
read -s CU015_CLAVE_DEMO
export CU015_CLAVE_DEMO
npm run tipos
npm run test:cu015:visible     # navegador abierto
npm run test:cu015            # ejecución automática
npm run informe              # informe HTML local
```

El runner rechaza destinos ajenos: URLs y proyecto están fijados, valida las
etiquetas y la configuración efectiva del entorno CU-015. Crea un recinto y un
evento propio mediante las API reales de CU-029/026, luego registra/edita el
establecimiento mediante la interfaz. Valida persistencia al recargar, duplicados,
datos inválidos, horario, estado, catálogo y checkout desde un menú abierto antes
del cierre. No hay mocks ni interceptores de la API de negocio, ni pausas fijas.

Para probar el efecto en un pedido se crea **un producto propio mediante CU-012**:
el fixture asigna una cuenta Personal existente y registra el producto por la API
real. El inventario queda listo sin SQL ni preparación manual. Se usa checkout,
Redis, pasarela, confirmación y QR reales de CU-011, sin sobrescribir otros stocks. Al cerrar,
el pedido confirmado se compara íntegramente y permanece idéntico. Cada ejecución
usa nombres/UUID nuevos; conserva sus datos y no borra los de nadie.

La segunda prueba comprueba Organizador/Administrador, 401/403 por gateway y
Núcleo, duplicados concurrentes, datos inválidos, evento inexistente/cancelado y
la asignación/revocación de Personal por establecimiento.

Informe en `.evidencia/informe/index.html`, capturas en `.evidencia/resultados/`
y trazas retenidas cuando falla una prueba. Las trazas pueden contener respuestas
de login y cabeceras: son privadas y todo `.evidencia/` está excluido de Git.
Para inspeccionar una: `npx playwright show-trace RUTA_PRIVADA/trace.zip`.
Configuración basada en la [documentación de Playwright Test](https://playwright.dev/docs/test-configuration)
y su [visor de trazas](https://playwright.dev/docs/trace-viewer-intro).

## Persistencia, regresión y verificaciones

Desde `App/backend`, después de `npm ci`:

```bash
npm run lint
npm run build
npm run test:cu015:migracion
REDIS_HOST=127.0.0.1 REDIS_PUERTO=16404 REDIS_INVENTARIO_PRUEBAS_URL=redis://127.0.0.1:16404 npm test -- --runInBand
npm run verificar:infra
```

En cada portal Angular se puede ejecutar además `npm test -- --watch=false
--browsers=ChromeHeadless`, con `CHROME_BIN` apuntando al ejecutable local de Chrome.

La prueba de migración crea dos bases nuevas de nombre aleatorio en el PostgreSQL
propio, tras validar propietario, etiquetas y puerto. Una instala las 27
migraciones actuales; la otra instala primero las 25 anteriores, inserta establecimiento,
producto, pedido y detalle propios, aplica CU-015 y CU-012 y compara los campos anteriores.
El ensayo específico CU-012 parte de 26 y conserva también una reserva ACTIVA.
En ambas comprueba repetición sin DDL, 18 procedencias originales y cero tablas
en public. Las bases quedan para inspección; nunca toca las referencias A/B.

La regresión original de CU-011 se ejecuta sobre **su proyecto de regresión existente**,
reutilizando su suite completa y las definiciones de recursos existentes:

```bash
# Desde la raíz, liberar memoria de las apps propias antes de la regresión:
./App/infra/cu015.sh parar
cd App/backend
npm run build
npm run test:cu015:regresion
cd ../..
./App/infra/cu015.sh iniciar
```

`hexacore-cu015-regresion` usa su propia red, volúmenes y PostgreSQL/Redis/broker;
los puertos `15439/16384/15679/16779/13105/13106/13087` deben estar libres.
El runner valida propietario/checkout, puertos y destinos, no adopta recursos de
otros proyectos y solo hace stop al terminar. No inicia los proyectos de referencia.
La suite crea y elimina únicamente sus fixtures y prueba pagos, compensaciones,
idempotencia, sesiones, revocación, HMAC, mensajería y cierre SIGTERM. Su fixture
ahora crea también un evento en la autoridad vigente; no se quitan aserciones.

Resultados realmente ejecutados, incidencias y alcance:
[PLAN-CIERRE-SEBASTIAN](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

## Pantallas y navegación para Usabilidad

Login Organizador/Administrador → menú Operación → **Establecimientos** → elegir
evento → listado completo → Nuevo establecimiento / Editar → guardar → confirmación
visible. Cada fila conserva contacto, entrega, horario/zona, estado y recepción
efectiva. Deshabilitar/Habilitar no borra la ficha. El selector de evento queda en
la URL para conservar la navegación al recargar. Las etiquetas de formulario,
botones deshabilitados, errores `role=alert` y confirmaciones `role=status` permiten
usar teclado y lectores de pantalla. En móvil el formulario pasa a una columna y
la tabla admite desplazamiento horizontal.

Cliente autenticado → `/pedidos?eventoId=UUID` → establecimientos disponibles → menú
→ checkout → pago → QR. Un menú abierto antes del cierre informa el rechazo sin
crear un pedido nuevo. Sebastián documenta estas pantallas; Daniel consolida la
validación global de Usabilidad. No se afirma cumplimiento global RNF con este recorrido.
