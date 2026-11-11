# Demostraciones CU-012–015, CU-027 y CU-029; CU-028 bloqueado

## Demo visual con velocidad configurable

Desde la raíz, abre el navegador con **800 ms entre operaciones de Playwright**
y **cinco segundos para leer las etapas relevantes**:

```bash
npm --prefix App/e2e run demo
```

El modo demo carga `App/e2e/.env.local` si existe, incluida la `CU015_CLAVE_DEMO`
configurada localmente; las variables ya exportadas tienen prioridad. El archivo
es privado e ignorado por Git. No cambia contraseñas ni vuelve a sembrar datos.
Requiere el entorno CU-015 existente activo y Chromium instalado.

Para cambiar la velocidad o elegir un recorrido visual:

```bash
CU015_DEMO_MS=2000 npm --prefix App/e2e run demo
CU015_DEMO_MS=2000 npm --prefix App/e2e run demo -- cu015 --grep 'por portales'
CU015_DEMO_MS=2000 CU015_DEMO_PAUSA_MS=8000 npm --prefix App/e2e run demo -- cu015 --grep 'por portales'
```

`CU015_DEMO_MS` y `CU015_DEMO_PAUSA_MS` aceptan enteros desde cero; valores
inválidos fallan explícitamente. El primero configura `slowMo` al lanzar el
navegador; los contextos creados explícitamente con `browser.newContext()`
comparten ese navegador y esa demora. Ningún recorrido crea un navegador con
`launch()` independiente. Las llamadas API/SQL no reciben esa pausa.
Sin filtros se descubren los mismos trece casos implementados; algunos son
comprobaciones API sin interfaz visible.

`slowMo` separa operaciones, pero no mantiene una pantalla después de una
respuesta o antes de cambiar de actor. `presentar()` añade puntos de lectura
en los recorridos CU-012/013/014/015/027/029 y sus accesos: trae la página activa
al frente, muestra la etapa en el informe y espera `CU015_DEMO_PAUSA_MS` (5.000 por
defecto). Permite leer registro/validaciones, edición, compra/pago/QR, preparación,
entrega, cuentas y recintos. En normal/CI la función retorna sin enfocar páginas,
crear etapas, esperar ni adjuntar datos. No modifica las aserciones ni reintenta
peticiones fallidas; los tiempos y vencimientos reales del negocio siguen activos.

Este modo usa una configuración separada y se rechaza en CI. Mantiene un
trabajador, cero reintentos y 15 s por aserción. **Solo demo** dispone de hasta
quince minutos totales por caso para la presentación; una acción/navegación
individual sigue limitada a 120 s. No se amplían las esperas HTTP del producto.
Normal/CI conservan 120 s totales y su velocidad original. Los errores HTTP,
aserciones fallidas y timeouts conservan la salida de error. Elegir otro ritmo
o recorrido para una presentación no cambia la aceptación registrada.

Sus resultados e informes quedan separados en una sola carpeta
`.evidencia/demo-FECHA/` por ejecución, con marca DEMO y trazas de todos los
contextos incluso cuando pasan. Cada punto de lectura adjunta contexto/navegador
y duración, sin URL, credenciales ni QR en esos metadatos. Las trazas completas
siguen siendo privadas. No se sobrescriben los informes de aceptación. Los comandos normales,
`:visible`, CI y el diagnóstico CU-028 de `test:completo` mantienen su velocidad
y límites actuales. **Un demo aprobado no sustituye la aceptación automática ni
declara aprobado CU-028.**

### Verificación de presentación — 11 de noviembre de 2026

Se reprodujo `CU015_DEMO_MS=2000 npm --prefix App/e2e run demo`. La traza de
CU-012 contiene el contexto de la fixture y los dos `browser.newContext()`
explícitos, con separaciones de aproximadamente dos segundos entre acciones.
`slowMo` ya llegaba a los tres: faltaban pausas para leer las etapas y cambiar
el foco entre actores. CU-012 visual agotó los 120 s de la configuración demo
anterior. Se interrumpió esa reproducción después de conservar los primeros
fallos (salida 130); no se presenta como un conjunto completo.

Comprobaciones posteriores, con las mismas operaciones y aserciones de negocio:

| Comprobación | Resultado |
|---|---|
| CU-015 normal, recorrido visual completo | **1/1**, 14,3 s; ninguna etapa demo ejecutada |
| Primer CU-015 demo, 2.000/5.000 ms | Falló con **500 al vincular Personal**; SELECT/57014 registrado a las 13:19:41 UTC |
| Segundo CU-015 demo, 2.000/5.000 ms | Falló al seleccionar evento: GET `/eventos` abortado tras 14.962 ms; se conserva el timeout del selector |
| CU-029 demo, recorrido visual completo, 2.000/5.000 ms | **1/1**, 2,1 min; registro, zonas, plano, edición persistida, protección de cupos y confirmación de impacto |
| Lectura real en CU-029 | **Ocho etapas**, 5.001–5.004 ms cada una; 27 acciones con intervalo mínimo 2.014 ms |
| Tipos y controles de configuración | Aprobados; normal/CI, valores por defecto, 2.000 ms, pausa 8.000 ms, cero y rechazo de valores inválidos/CI |

Evidencias privadas de los recorridos: `.evidencia/demo-reproduccion-2026-11-11T13-07-53Z/`,
`demo-cu015-negocio-2026-11-11T13-17-09Z/`,
`demo-normal-cu015-2026-11-11T13-21-40Z/`,
`demo-cu015-negocio-2-2026-11-11T13-23-06Z/` y
`demo-cu029-negocio-2026-11-11T13-28-33Z/`. Cada log indica su informe DEMO;
el aprobado quedó en `demo-2026-11-11T13-28-34-062Z/` con captura y traza completas.
No se repitieron semillas ni se alteraron contraseñas. No hay reintentos nuevos
para ocultar esos fallos. El aprobado de CU-029 verifica la presentación con
negocio real y no convierte los fallos CU-015 en aprobaciones ni actualiza la
aceptación conjunta histórica que se conserva debajo.

## Resultado vigente: estabilidad conjunta, 8 de noviembre de 2026

**Los trece todavía no aprobaron conjuntamente.** Último automático **10/13,
5,2 min, salida 1**; último visible, separado, **12/13, 4,1 min, salida 1**.
Evidencias privadas: `.evidencia/conjunto-observado-2026-11-08T14-46-48-499Z/`
y `conjunto-observado-2026-11-08T14-52-23-114Z/`. Se conservan también la referencia
9/13 y los intentos intermedios 12/13 y 11/13; no se sustituyen ni suman resultados.

En automático fallaron CU-012 visual (POST producto abortado a 15 s/499), CU-012
API (expiración tardía con timeout SQL) y CU-027 visual (sesión actual sin respuesta
terminada tras recargar perfil). En visible falló CU-013: renovación **503 por
Query read timeout PostgreSQL**, correlacionado en Identidad. No se atribuye ese
503 a DNS. Los SQL, DNS confirmados, esperas upstream/499 y sincronización siguen
separados en el [plan](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

Quedaron comprobados `min:1` por pool para evitar apertura/cierre cada diez segundos,
la sonda HTTP sin arrancar Node, la resolución dinámica en segundo plano con zona
de Nginx y la espera explícita del vínculo/lectura CU-012 antes de su aviso.
El control DNS reprodujo **503 frente a 200** del upstream ya conocido; conserva
DNS Docker, TTL 5 s y espera 3 s, sin IP fija ni reintentos de negocio adicionales.
NXDOMAIN y el arranque siguen dependiendo de resolver; no se ocultan 500/503 del
servicio. Detalle y ensayo aislado: [gateway](../gateway/README.md).

Ambas aceptaciones mantuvieron **once contenedores propios y treinta restantes**
activos, con todas las aplicaciones propias restauradas: Núcleo, Boletería,
Trabajador, gateway, dos portales y cinco proveedores. CU-013 API y CU-014 API
reinician deliberadamente solo Núcleo. Mac M2/8 GB; VM 2,84 GiB, ocho vCPU.
Hubo presión de memoria, swap casi lleno y reclamación de páginas,
sin OOM/cuota CPU propia; no hay prueba de agotamiento del pool ni causa única.
El contraste pendiente requiere que el propietario libere capacidad compartida
(los cinco procesos principales Redash observados suman unos 1,56 GiB), o ajuste
el presupuesto de la VM, y repetir ambos conjuntos con las mismas fuentes.
No se intervinieron esos recursos ni A/B. No se garantiza que esa acción sola
resuelva cada incidente; dos conjuntos verdes tampoco certificarían disponibilidad.

Además aprobaron backend **919/919 en 64 suites**, tipos/build de ambos procesos,
tipos E2E, guardas **13/13**, fronteras, CU-011 **9/9**, Boletería **23/23**,
control de pools y recuperación CU-012 con cinco intenciones inciertas tras
reinicio. Los builds y esas suites se ejecutaron en serie con las seis aplicaciones
propias pausadas; sus proveedores conservaron datos. CU-014/cámara y las funciones
existentes se reutilizan. No se añaden casos de uso.

## Recorridos implementados y comandos

Con Node 22.22.3, dependencias instaladas y `CU015_CLAVE_DEMO` definida localmente,
reutilizar el entorno propio existente, sin semillas. Builds y suites pesadas se
ejecutan en serie (Mac M2, 8 GB). Los comandos parten de la raíz:

```bash
./App/infra/cu015.sh iniciar --compilar nucleo boleteria api-gateway
npm --prefix App/e2e run tipos
npm --prefix App/e2e run test:cu014
npm --prefix App/e2e run test:cu014:visible
npm --prefix App/e2e run test:cu027
npm --prefix App/e2e run test:cu027:visible
npm --prefix App/e2e run test:cu029
npm --prefix App/e2e run test:cu029:visible
npm --prefix App/e2e run test:cu012        # también :visible
npm --prefix App/e2e run test:cu013        # también :visible
npm --prefix App/e2e run test:cu015        # también :visible
git fetch origin feature/samuel develop
npm --prefix App/e2e run test:cu028:estado
npm --prefix App/e2e run test:completo
npm --prefix App/e2e run test:completo:visible
```

Son **13 recorridos implementados**, un trabajador, cero reintentos, 120 s por
caso y 15 s de aserciones. `test:implementados` / `:visible` ejecuta esos 13;
`test:completo` añade el diagnóstico explícito CU-028, conserva cada informe en
`.evidencia/conjunto-FECHA/` y devuelve **2** si lo implementado pasa pero CU-028
sigue bloqueado (o requiere revisar una referencia nueva). Un fallo de Playwright
conserva su código de salida. Nunca se declara aprobado CU-028 por abrir Roles.
La comprobación remota del 8/11 mantiene Samuel `f2db59e` y develop `a2e85d5`:
faltan CRUD/matriz, propagación a sesiones, revocación/auditoría y concurrencia.
No se integran esas ramas ni parqueaderos. El script inspecciona las referencias
locales obtenidas por fetch: una ruta nueva exige revisar sus fuentes completas.

CU-014 usa una compra/pago CU-011 real y contextos independientes Cliente/Personal.
Personal prepara hasta listo, cierra el establecimiento al público e ingresa el
QR completo en «Preparación de pedidos» → «Validar y entregar pedido». Prevalidar
muestra productos/punto sin consumir; «Confirmar entrega» exige respuesta del
servidor. La prueba pierde la respuesta después del commit real, recarga y recupera
la misma operación sin guardar el QR; comprueba una entrega, aviso/fecha y ausencia
de QR utilizable al recargar el cliente. API/SQL adicionales comprueban concurrencia,
reinicio, snapshots, replay del pago y rechazos; los estados inconsistentes son
fixtures propios, no una política de cancelación CU-011F/F12.

CU-027 registra una cuenta propia desde UI y utiliza su correo simulado local
(sin vaciar el buzón) para verificación y recuperación. Perfil, desactivación,
reactivación y cambios de contraseña pasan por UI/gateway; un segundo contexto
administrativo no modifica cuentas compartidas. Se exige uso único de enlaces,
revocación y rechazo de roles no autorizados. CU-029 registra/edita zonas y plano
por UI, recarga y comprueba persistencia. Un evento publicado CU-026 es fixture por
API para probar protección de cupos y confirmación de impacto. Los negativos de
roles/archivos/capacidad se verifican también por gateway y acceso directo.
El plano usa el almacenamiento SQL existente; no certifica un proveedor S3.

La prueba web CU-014 acredita **entrada manual**, no cámara física. Flutter
reutiliza `qr_scanner_sheet.dart` y mobile_scanner resuelto 7.4.2, sin actualizar
dependencias/permisos. Las pruebas unitarias de plataforma cubren denegación,
cámara indisponible, detección repetida y cierre/segundo plano. Para lectura óptica:

```bash
cd App/frontend/app-movil
flutter analyze
flutter test --concurrency=1
flutter test integration_test/cu014_camera_test.dart -d ID_DEL_DISPOSITIVO --dart-define=CU014_QR_VERIFICADOR=VERIFICADOR_DEL_ENSAYO
```

El verificador se toma de `qr-huella.json` (`verificadorOptico`) junto a
`qr-real-privado.png` del informe CU-014 elegido. Abrir esa imagen en el Mac y
apuntarla con el dispositivo conectado/desbloqueado, aceptando el permiso. El
verificador FNV-64 solo identifica la imagen en esta prueba; no es autenticación.
La aplicación de prueba usa el componente de cámara real, sin servidor simulado,
y comprueba lectura/cierre. El negocio se demuestra aparte con backend real.
No publicar imagen, QR, sesiones, trazas, credenciales ni configuración de firma.
Resultados exactos y dispositivo: [plan](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

Las migraciones de CU-014 comprueban vacía y actualización desde 28 hasta **29**,
18 procedencias, repetición sin DDL y preservación íntegra de pedido, preparación,
pagos, historial y reservas. Comandos backend, en serie:

```bash
npm --prefix App/backend run lint
npm --prefix App/backend run build
npm --prefix App/backend run build:boleteria
npm --prefix App/backend run test:cu014:migracion
npm --prefix App/backend run test:cu013:migracion
npm --prefix App/backend run test:cu012:migracion
npm --prefix App/backend run test:cu015:migracion
npm --prefix App/backend run test:cu015:regresion -- --boleteria
npm --prefix App/backend run test:cu015:pool
npm --prefix App/backend run test:cu012:recuperacion
npm --prefix App/backend run verificar:infra
```

La opción `--boleteria` ejecuta CU-011 y las 23 regresiones de Boletería en serie,
con los mismos recursos exclusivos `hexacore-cu015-regresion`, y los detiene al
salir conservando volúmenes. Sin esa opción ejecuta solo CU-011; no hace falta
ejecutar las dos variantes consecutivamente.
Antes de tipos/build/unitarias/regresiones, se pueden pausar **solo** las seis
aplicaciones propias con la misma validación y bloqueo del guion:

```bash
python3 - <<'PY'
import sys, json, fcntl
sys.path.insert(0, 'App/infra/revision')
import revision as r
r.seleccionar_perfil('cu015')
c = json.loads(r.compose('config', '--format', 'json', capturar=True))
r.validar_configuracion(c)
r.comprobar_recursos(c, r.contenedores_propios())
with (r.ESTADO / 'operacion.lock').open('a') as bloqueo:
    fcntl.flock(bloqueo, fcntl.LOCK_EX | fcntl.LOCK_NB)
    r.compose('stop', '--timeout', '30', *r.EJECUTAR)
PY
```

Restaurarlas antes de los recorridos mediante el primer comando `iniciar`.
No usar `--datos-demo`, borrar volúmenes ni reconstruir Redis. El ensayo DNS se
ejecuta sin ningún recorrido activo y restaura la configuración en `finally`:

```bash
python3 App/infra/revision/test_dns.py
```

Para repetir los trece con el observador SQL/recursos de solo lectura y el
bloqueo CU-028 explícito (misma semántica de salida 2 si pasan):

```bash
node App/backend/test/cu013/referencia.cjs --implementados
node App/backend/test/cu013/referencia.cjs --implementados --visible
```

Conserva cada ejecución en `.evidencia/conjunto-observado-FECHA/`; `--todos`
sigue siendo la referencia de seis CU-012/013/015. No inicia ni detiene servicios.

Las secciones siguientes conservan los resultados históricos y diagnósticos.
SQL, DNS confirmado y 499 permanecen separados; una ejecución individual aprobada
no cambia el resultado del último conjunto. No se amplían plazos ni reintentos.

Referencia publicada al comenzar esta etapa (`fafedfe`): conjunto observado **10/13**, salida 1;
fallaron UI CU-012 (renovación 503), UI CU-013 (500 SQL) y UI CU-029 (carga inicial
sobrescribió la edición del test). CU-029 corregido pasó después **2/2 visible**;
no convierte el conjunto en verde. CU-014 **3/3** y CU-027 **2/2** pasaron dentro
del conjunto. Cámara física **1/1** en iPhone 17 Pro Max/iOS 26.6. CU-028 sigue
bloqueado; SQL/DNS/499 mantienen evidencias y causas separadas. Los resultados
vigentes de estabilidad están al inicio. Detalle y todos los
fallos: [plan](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

## Preparación CU-013 en el entorno existente

Se reutiliza `hexacore-cu015-sebastian`, sin semillas ni reconstrucción de inventario.
Con Node 22.22.3 y `CU015_CLAVE_DEMO` definido localmente, desde la raíz:

```bash
./App/infra/cu015.sh iniciar --compilar nucleo portal-web-admin portal-web-cliente
npm --prefix App/e2e run tipos
npm --prefix App/e2e run test:cu013
npm --prefix App/e2e run test:cu013:visible
node App/backend/test/cu013/referencia.cjs --todos
```

El último comando ejecuta **los seis casos juntos**, con un trabajador, cero
reintentos, 120 s por caso y 15 s para aserciones. Sin `--todos`, el observador
ejecuta solo los cuatro CU-012/015 originales. No ejecutar suites pesadas en paralelo.
`test:referencia` conserva ese conjunto original; `test:preparacion` conserva esos seis; `test:alimentos` incluye también CU-014 (nueve).

Recorrido manual: Cliente compra y paga en el portal cliente, abre «Ver seguimiento
y avisos» o «Mis pedidos». En otra sesión, Personal abre «Preparación de pedidos»,
elige su establecimiento y el pedido recibido; inicia con minutos estimados,
registra retraso con motivo, reporta/resuelve una incidencia y marca listo.
El cliente recibe avisos dentro de la página y recupera el mismo QR al recargar.
Cerrar el establecimiento no impide gestionar sus pedidos. En Flutter: «Pedidos»
para Personal y «Mis pedidos» para Cliente; abrir un pedido muestra detalle, QR y
avisos antes de la lista. Las listas muestran páginas de 100 con navegación a
pedidos anteriores y recientes; el detalle propio también se recupera por su
identificador en la ruta web. El detalle proyecta los últimos 100 cambios/avisos;
el historial completo permanece en SQL.

Los dos casos CU-013 usan contextos independientes, gateway/portales reales y
PostgreSQL del entorno propio. Comprueban compra/pago, avance visible, cinco avisos
sin duplicados, estimación, faltante explícito, cierre del establecimiento,
revocación, concurrencia, replay del pago durante preparación y listo, snapshots
íntegros, navegación a un histórico tras 100 filas y recuperación tras reiniciar
Núcleo. Los estados negativos se preparan como fixtures SQL propios:
**no implementan una política de cancelación**.

El canal de avisos es web/app, durable en SQL; no son correos ni push. Sondeo de
15 s solo en pantalla activa, sin solapar y pausado ante errores. La preparación
no cambia estado financiero, QR, importes ni inventario. Alcance y alternativos:
[DECISION-CU013](../backend/modulos/alimentos/recepcion/DECISION-CU013.md).
Entrega/validación única se integra ahora con CU-014; cancelación CU-011F y F12, pendientes.

El diagnóstico de fallos SQL registra en el log propio de Núcleo `FALLO_SQL` con
contadores reales del pool (`total`, `libres`, `esperando`, `maximo`), demoras del
bucle de Node y memoria. No añade consultas, reintentos ni cambios de HTTP. El
histograma cubre desde el arranque o fallo anterior, no una duración exclusiva de
la petición; los contadores son una instantánea al manejar el fallo. El observador
conserva logs y muestras privadas en `.evidencia/cu013-referencia-FECHA/`.
Resultados, fallos conservados y límites: [plan](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

Resultado final del 7/11/2026: backend **904/904**, Angular **5/5 + 19/19**,
Flutter analyze sin incidencias y **59/59**, CU-011 original **9/9**, migraciones
CU-013 **2/2** y regresiones CU-012/CU-015 **2/2 + 2/2**. El último conjunto real
terminó **5/6**: pasó CU-013 visual completo y ambos CU-012/CU-015; falló el login
de la API CU-013 con 503 por statement timeout SQL (sin error DNS registrado en
esa ejecución). La API se comprobó después individualmente **1/1**:

```bash
npm --prefix App/e2e run test:cu013 -- --grep 'CU-013 API:'
```

Ese resultado individual no convierte el conjunto en 6/6. SQL, el 503 DNS
confirmado en otra ejecución y el 499 histórico siguen abiertos por separado.
No se aumentaron plazos/reintentos ni se redujeron aserciones. La comparación
con Boletería/Trabajador propios pausados tampoco resolvió el DNS; ambos quedaron
restaurados y saludables. Las evidencias permanecen en `.evidencia/`, fuera de Git.

## Referencia previa a preparación CU-013

Desde la raíz, con Node 22.22.3, el entorno CU-015 existente iniciado y
`CU015_CLAVE_DEMO` definido localmente como se indica debajo:

```bash
node App/backend/test/cu013/referencia.cjs
```

Ejecuta los cuatro casos existentes sin cambiar reintentos, trabajadores ni
timeouts. Un observador de solo lectura toma muestras acotadas de actividad y
bloqueos PostgreSQL, plan/duración del sondeo de ajustes, presión de la VM,
recursos Docker y memoria del host. Finaliza al terminar Playwright y conserva
informe, muestras y logs propios en `.evidencia/cu013-referencia-FECHA/`.
Las muestras PostgreSQL no miden el waitingCount interno del pool de Núcleo ni
certifican ausencia de picos entre muestras. El filtro descrito arriba lo registra
al manejar un fallo SQL HTTP. El observador no inicia, detiene ni modifica proyectos.

La referencia del 7/11/2026 **pasó como conjunto 4/4**; recuperación CU-012 volvió
a recuperar cinco intenciones tras reinicio. SQL, DNS y 499 anteriores conservan
sus evidencias y causas sin cerrar: un conjunto aprobado no prueba que se hayan
resuelto. Mediciones y decisión del hito: [plan](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).

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
npm run test:referencia      # CU-012/015, un trabajador y cero reintentos
npm run informe
```

Recorrido real: Organizador → Establecimientos → Personal → cuenta existente →
buscar por nombre/correo y asignar. Personal entra al portal y accede a `/admin/menu` y `/admin/preparacion`; cuentas, roles,
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
5 de 20. En todos los ajustes del recorrido, si la respuesta es 202 se exige PENDIENTE
y se consulta esa misma
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
npm run test:cu013:migracion
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
CU-013 comprueba también vacía/actualización desde 27 hasta 28, preservando
reservas activas/consumidas, pedidos pendientes/confirmados, pagos y detalles;
el confirmado histórico se proyecta recibido y conserva el QR. Para las unitarias
en el equipo de 8 GB se pausaron las aplicaciones propias con las guardas del
perfil, manteniendo PostgreSQL/Redis activos; luego se restauró el entorno.

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
Para ejecutar los cuatro recorridos originales con navegador visible: `npm run test:referencia -- --headed`.
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
./App/infra/cu015.sh iniciar --compilar nucleo
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
