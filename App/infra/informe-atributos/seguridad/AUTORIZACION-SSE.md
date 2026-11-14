# Revalidación del SSE de Parqueaderos — 13/11/2026 Bogotá

**Cobertura sin aumento: 113/159, Parqueaderos 25/25, 46 pendientes. RNF-05/06 parciales.**
Solo `GET /api/v1/parqueaderos/eventos/:eventoId/ocupacion/flujo` y su consumidor.
[Evidencia permitida](SSE-PARQUEADEROS-EVIDENCIA.json); [corte previo](AUTORIZACION-PARQUEADEROS.md).

## Causa y reproducción anterior

La guarda verificaba JWT, roles y revocación Redis al conectar. El observable
posterior consultaba ocupación cada tres segundos sin volver a validar.
En un evento/sesión exclusivos se recibe el primer panel, se cierra realmente
la sesión por DELETE sesiones/actual y otro operador crea una zona. El flujo
abierto entrega esa capacidad nueva con timestamp posterior a la revocación;
una conexión nueva recibe 401. Reproducido en gateway y Núcleo: **3000,4 / 3018,1 ms**
después de la revocación. Es dato nuevo, no un frame anterior retenido.

## Comportamiento nuevo

`SesionValida.validar` reutiliza exactamente el verificador JWT y la consulta
Redis existentes. La guarda inicial conserva permisos y HTTP 401/403/503.
Se vuelve a verificar JWT después de esperar Redis, para no aceptar una
caducidad ocurrida durante esa espera. No se agrega un sistema de sesiones,
una clave de revocación nueva ni una interpretación alternativa del JWT.

`FlujoOcupacionService` comprueba al inicio y en el ciclo existente de **3 s**,
tanto si hay un panel pendiente como si no. También comprueba antes de emitir
el resultado del panel. Cada conexión comparte su comprobación en curso:
sin comprobaciones solapadas ni consultas de panel apiladas. Un fallo completa
el observable, desuscribe los trabajos y descarta sus resultados tardíos.
El módulo completa las conexiones al apagarse; desconectar cancela la suscripción
y su temporizador. No hay temporizadores globales ni mapas de sesiones nuevos.

Es detección periódica, **no instantánea**: hasta un ciclo de 3 s más el coste
de comprobación Redis (commandTimeout existente de 2 s), planificación y red.
La espera del panel se limita a **5 s**; sus consultas de Parqueaderos usan
`SET LOCAL statement_timeout = '2000ms'` dentro de una transacción de lectura,
sin cambiar configuración del pool para otras operaciones. Se conserva la
interfaz existente de Eventos. La desuscripción no cancela promesas arbitrarias
de otros servicios: deja de esperarlas y nunca entrega su resultado tardío.
Las consultas propias en curso conservan el límite SQL y liberan la transacción.

Una respuesta SSE iniciada sigue siendo **HTTP 200**. Antes de cerrar se envía
un único evento saneado, seguido de EOF:

```text
event: sesion_finalizada
data: {"codigo":"SIN_AUTENTICAR","mensaje":"Tu sesión terminó. Inicia sesión de nuevo."}
```

Redis no comprobable usa `SESIONES_NO_DISPONIBLES`; un fallo o timeout del panel
usa `FLUJO_NO_DISPONIBLE`. Ambos llevan un mensaje fijo, sin errores internos,
trazas, token o contenido del proveedor. No se convierte el HTTP abierto en 401.
El acceso continúa exclusivamente en **Authorization: Bearer**, nunca en URL.

## Consumidores

Portal administrativo: reconoce el evento terminal, cancela/descarta datos
posteriores y libera reader/lock. Ante 401 usa **una vez** la renovación existente
por cookie hasta recibir otro panel válido; ante un segundo rechazo se detiene.
403/503 terminales no generan reconexión automática. Un error de `tokenVigente`
antes de fetch conserva su estado HTTP para aplicar la misma política.
Destruir/cambiar evento invalida renovaciones pendientes y evita reabrir después.
Los fallos de transporte conservan el backoff existente; la etiqueta deja de
prometer reconexión cuando se ha detenido. No se cambia la renovación de sesión.

La app móvil usa HTTP para reservas/pagos y operación del parqueadero; no se
encontró consumidor de este endpoint SSE y no se modifica. Monitoreo y Evacuación
mantienen un patrón equivalente de guarda inicial + intervalo, identificado por
lectura de sus controladores. Son riesgos pendientes fuera de esta corrección;
no se modifican ni se declaran cubiertos por estas mediciones.

## Pruebas y medidas

**HTTP real**, en gateway y Núcleo directo, con PostgreSQL/Redis/RabbitMQ reales
del ámbito propio y proveedores simulados: continuidad (dos paneles nuevos),
rechazos iniciales 401/403, revocación por la API, caducidad, Redis no comprobable
antes/después de abrir, revocación durante consulta, desconexión del cliente y
SIGTERM con dos flujos abiertos. Un evento terminal y EOF; cero datos posteriores.

Caducidad: JWT de ensayo firmado con `exp` de cinco segundos para una sesión
propia real; la **emisión corta es fixture**, el verificador, Redis y transporte
HTTP son reales. No se cambian reloj, fila de sesión ni TTL productivo de 15 min.
Redis: `CLIENT PAUSE 6500 ALL` únicamente en el contenedor nuevo exclusivo;
fin programado, sin stop/flush del Redis compartido ni reintentos buscando verde.
Consulta: LOCK de tabla en la base nueva, panel bloqueado observado en
pg_stat_activity, revocación real y liberación del LOCK antes de terminar el panel.

| Final UTC del 14/11 (13/11 Bogotá) | Revocación G/N, ms | Tras exp G/N, ms | Redis G/N, ms | SIGTERM, ms |
|---|---|---|---|---|
| 03:10:08.983 | 3002,85 / 2994,77 | 1750 / 1339 | 4924,40 / 4903,24 | 245,92 |
| 03:11:02.915 | 3000,37 / 3000,74 | 1731 / 1452 | 4912,38 / 4930,08 | 272,12 |
| 03:11:56.887 | 2998,04 / 2999,21 | 1650 / 1316 | 4918,82 / 4915,49 | 266,28 |

Las tres finales aprobaron ambos canales. Durante consulta: cierre tras revocar
**3,01–6,94 ms**, sin emisión tardía. Redis antes de abrir: **503 en 2004,98–2018,61 ms**.
SIGTERM: dos flujos terminados por pasada, proceso **0 sin OOM**, mismo límite
existente de **5 s**. Después de cada caso se reanuda el mismo contenedor una vez
como parte prevista del ensayo. HTTP/SSE conserva **10 s**; sin ampliaciones ni
reintentos. Misma imagen, Node 22.22.3, **21 JS** coincidentes, fuentes/arnés del
servidor estables, memoria antes/después; no se ejecutan los 300 ni los 16 recorridos.

**Unitarias backend: 20/20**, cinco suites (siete anteriores + trece nuevas).
Dobles y tiempo virtual para intercalaciones: revocación con promesa pendiente,
ausencia de validaciones solapadas, timeouts, desconexión y cierre del módulo.
Firma JWT real para casos de validación; Redis es doble en estas unitarias.
**Portal: 6/6**, dobles en Chrome Headless, renovación acotada y recursos liberados.
No son ejecuciones HTTP del navegador contra el backend. Se agrega además una
regresión HTTP a la suite de Parqueaderos de CI; no se ejecuta localmente toda
esa suite para repetir los 300 controles.

Desarrollo HTTP previo al corte final también aprobó ambos canales. Fallos
conservados: chequeo de tipos con tsconfig base sin Jasmine, corregido usando
app/spec sin tocar configuración; prueba adicional del consumidor **5/6** porque
se perdía el 401 al obtener token, corregido propagando ErrorCuenta, **6/6** después.
Este complemento del cliente no cambia el servidor de las tres mediciones;
huellas del cliente final y del corte medido se guardan separadas.

## Reproducción y entorno

Seguir la [alternancia autorizada](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md),
registrando motor/IDs/imágenes/montajes/estados. Base, Redis/volumen y vhost nuevos;
siete cuentas nuevas, eventos/sesiones exclusivos, migraciones sin semillas.
Reutilizar preparadores previos y una carpeta `.privado` nueva, ignorada:

```bash
export SEGURIDAD_SALIDA="$PWD/App/infra/informe-atributos/seguridad/.privado/sse-NUEVA-VENTANA"
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs iniciar hexacore-seg-parq-nucleo:autorizacion-evento
node App/infra/informe-atributos/seguridad/preparar-parqueaderos.cjs
node App/infra/informe-atributos/seguridad/sondear-sse.cjs
```

El sondeo anterior exige una imagen **con el comportamiento anterior** y se
detiene si no lo reproduce. Compilar etiqueta exclusiva del Núcleo y sustituir
solo el contenedor de ensayo, conservando el anterior detenido:

```bash
npm --prefix App/backend run build
docker build -t hexacore-seg-parq-nucleo:sse-sesion -f App/backend/Dockerfile App/backend
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs cambiar-imagen hexacore-seg-parq-nucleo:sse-sesion
npm --prefix App/backend test -- --runInBand --testPathPatterns=modulos/parqueaderos
python3 App/infra/informe-atributos/seguridad/finales-sse.py
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs parar
./App/infra/cu015.sh parar
python3 App/infra/informe-atributos/seguridad/restaurar-parqueaderos.py
```

Registrar auditoría posterior de restauración **solo lectura**, comparar los
originales y HTTP/cgroups; no reiniciar para recuperar HTTP. Exportar con
`resumir-sse.py`, que exige tres finales aprobadas y restauración acreditada.
Datos crudos/sesiones/frames/consultas/trazas en `.privado`, fuera de Git.
Sin CU-028/F12, funciones nuevas, DAST, fuentes/imágenes, ZeroTier ni reapertura
preventiva del incidente histórico de outbox. CI se comprueba por el SHA publicado
y queda registrada en PR #50, separada de estas tres mediciones.
