# Petición de productos abortada en la demo CU-015

Análisis del **17/11/2026** sobre la única ejecución visible del **16/11 Bogotá**
(17/11 UTC). Se mantienen **1000 ms entre operaciones y 2500 ms por etapa lista**,
slowMo cero, límites y reintentos. No se repitió el recorrido ni la aceptación.

## Petición y cronología

Fue el **segundo GET** a
`http://cu015.localhost:18100/api/v1/pedidos/establecimientos/<establecimiento-del-caso>/productos`,
al volver al menú después del pago y antes de deshabilitar el establecimiento.
La primera consulta al mismo recurso había respondido correctamente; la segunda
no es un reintento de la primera. Los identificadores completos, la traza y los
logs quedan en evidencia privada, fuera de Git.

| Instante UTC, 17/11 | Bogotá, 16/11 | Evidencia |
| --- | --- | --- |
| 04:45:09.666 | 23:45:09.666 | Primer GET: HTTP 200 en 29,798 ms; producto activo, físico/disponible 5, reservado 0. |
| 04:45:13–15 | 23:45:13–15 | Checkout 201, pago 200 y webhook 204; el recorrido confirmó pedido y QR. |
| 04:45:19 | 23:45:19 | Renovación de sesión 200; sesión actual y establecimientos disponibles antes del nuevo menú. |
| 04:45:20.555 | 23:45:20.555 | Comienza el segundo GET de productos. |
| 04:45:21.156 | 23:45:21.156 | Playwright empieza a esperar/clicar «Agregar Producto CU015». |
| 04:45:35.587 | 23:45:35.587 | Chromium registra `net::ERR_ABORTED`, tras 15.032,368 ms; sin respuesta HTTP recibida. |
| 04:45:35, precisión de segundo | 23:45:35 | Access log del gateway: **499**, 0 bytes, `rt=14.960`, upstream de Núcleo seleccionado. Docker recogió la línea a las 04:45:36.013. |
| 04:47:21.202 | 23:47:21.202 | Vence el clic: 120.045,533 ms de espera, 105,615 s después del aborto HTTP. |

Los milisegundos proceden del HAR y del reloj monotónico de la traza. La hora del
selector se correlaciona con ese HAR. El access log tiene precisión de segundo;
la marca añadida por Docker corresponde a la recogida de la línea. No se tratan
esas marcas como tiempos idénticos. El estado `-1` del HAR significa que no hubo
respuesta HTTP disponible; **no** es un HTTP enviado por el backend. El 499 es el
registro de Nginx al observar que su cliente cerró la petición.

## Quién cancela y qué queda sin explicar

La atribución respaldada por código y tiempos es **el plazo del cliente HTTP del
portal**, ejecutado por el navegador:

1. [PedidosService.productos](../../App/frontend/portal-web-cliente/src/app/core/pedidos.service.ts)
   pasa su GET por `AuthService.conAcceso`.
2. [AuthService](../../App/frontend/portal-web-cliente/src/app/core/auth.service.ts)
   fija `ESPERA_MS = 15_000` y usa
   `firstValueFrom(peticion.pipe(timeout(ESPERA_MS)))`. El timeout desuscribe la
   petición pendiente. Su recuperación por 401 no se aplica a este error sin
   respuesta; no hubo otro GET de productos tras el aborto.
3. El portal configura `provideHttpClient(withFetch())`. El transporte Fetch de
   Angular llama a `AbortController.abort()` al desuscribirse una petición
   incompleta. La traza registra el aborto a los 15,032 s y, posteriormente, el
   mensaje de error del componente, sin nuevos productos renderizados.
4. No hubo una navegación o cierre del contexto cliente por Playwright entre el
   inicio de esa petición y el aborto. La espera del botón continuó otros 106 s.
   El cierre del contexto al terminar el caso no explica el aborto de los 15 s.

La traza no conserva la pila JavaScript de `AbortController.abort()`: el origen
en el plazo de RxJS es una atribución causal fuerte por código/tiempos, no una
captura directa de esa llamada. El cierre en el lado cliente sí está corroborado
por Chromium y el 499. Véanse las explicaciones oficiales de
[Angular sobre desuscripción y aborto](https://angular.dev/guide/http/making-requests),
[RxJS timeout](https://rxjs.dev/api/operators/timeout) y
[NGINX sobre 499](https://mailman.nginx.org/pipermail/nginx-devel/2018-January/010760.html).

**Gateway:** conservaba `proxy_connect_timeout 5s`, lectura/envío 35s y resolución
3s. El `nginx -T` posterior, de solo lectura, confirma esos valores y upstreams
con zona y `resolve`. No hubo 504/502 para esta petición: el cliente cerró antes
del plazo de lectura de 35s. No se recargó Nginx. Que el log tenga una IP de
upstream demuestra su selección, no que el handler de Núcleo terminara o siquiera
recibiera la solicitud a tiempo.

**Backend:** no se dispone de trazabilidad por ID del GET ni de sus tiempos de
conexión, cola, SQL y Redis. La causa de que no entregara el catálogo antes de
15s queda **sin aislar**. No se atribuye el cierre al backend ni se lo descarta
como origen de la lentitud.

Los archivos de frontend implicados y los lectores de catálogo/inventario no
difieren entre la revisión etiquetada de las imágenes locales (`56c0fca`) y el
checkout analizado. Hay diferencias posteriores en otras rutas/metadatos del
gateway; no se actualizaron imágenes ni se presentaron como causa de este GET.

## Infraestructura: hechos e hipótesis

**Hechos recogidos en la ejecución:**

- Gateway notificó timeouts DNS de Núcleo/Boletería a las 04:43:30, 04:44:22,
  04:44:29, 04:45:41 y 04:45:57 UTC. El 499 de productos tiene un upstream de
  Núcleo ya seleccionado. No se puede convertir la coincidencia de DNS en prueba
  de que este GET esperó una resolución DNS.
- PostgreSQL registró un statement timeout a las 04:43:28.237 UTC, recogido por
  Docker a las 04:43:29.283 y por Núcleo a las 04:43:35.885. Otro se registró a
  las 04:46:06.488 UTC. Núcleo también registró `Query read timeout` a las
  04:46:06.916/.955. No se igualan las marcas de cada proceso.
- Esos SELECT corresponden al recuperador de operaciones de inventario
  (`estado`, orden por secuencia, límite 50) y seguimiento de cancelaciones
  (orden por pedido, límite 50). No identifican la consulta HTTP de productos.
  El error de unicidad a las 04:44:03 corresponde al duplicado intencional del
  recorrido, que sí fue comprobado: no se cuenta como fallo de infraestructura.
- No se recogieron errores de Redis en su log de esa ventana. Esa ausencia no
  certifica que cada comando Redis de Núcleo tuviera respuesta oportuna.

| Hora aproximada UTC de escritura de la muestra | MemAvailable VM | SwapFree VM |
| --- | --- | --- |
| 04:40:15, previa | 242,39 MiB | 0,754 MiB |
| 04:44:08, durante | 139,10 MiB | 0,043 MiB |
| 04:50:07, posterior | 140,47 MiB | 0,215 MiB |

Son muestras puntuales, no un registro continuo ni mediciones exactamente a las
04:45:20. El motor tenía unos 2912 MiB y más de cuarenta contenedores activos.
El host disponía de 8 GiB, con unos 3960 MiB de swap usados de 5120 MiB. Los once
servicios CU-015 permanecieron saludables, sin nuevos OOM en su estado Docker.
Eso no demuestra que cada petición de negocio fuera oportuna.

En la comparación de inventarios, gateway de `hexacore-infra` aumentó su contador
de reinicios **425→434** y scheduler de Redash **352→362**. Se conservaron los 111
IDs, imágenes, configuraciones, montajes y estados activo/detenido; no se operó
ninguno de esos proyectos. Los contadores no identifican por sí solos OOM ni la
causa de cada reinicio. Durante el análisis, a las 00:07 Bogotá del 17/11,
seguían observándose unos 242 MiB disponibles y solo 0,219 MiB de swap libre en
la VM. No se ha demostrado capacidad estable para otro ensayo.

**Hipótesis pendiente:** la presión de memoria/swap y la carga compartida pueden
demorar procesos, DNS, pools o dependencias hasta exceder el plazo del portal.
Los logs acreditan inestabilidad concurrente, pero faltan muestras continuas y
trazabilidad del handler para asignar una causa única. No hay prueba de una
fuga, bloqueo concreto, error de stock o defecto nuevo del negocio.

## Precondición y regresión

| Clasificación | Conclusión respaldada | Límite |
| --- | --- | --- |
| Infraestructura | Hay timeouts DNS/SQL y una reserva de memoria/swap muy reducida. | No queda probado qué dependencia demoró este GET. |
| Precondición del recorrido | No llegó a estar listo el menú con productos: el componente conservó una lista vacía y mostró su error; el clic esperó un botón que no se renderizó. | Un timeout del selector no demuestra un selector obsoleto, cambio de actor o falta de fixtures. |
| Datos de ensayo | Primera consulta: producto activo/disponible con cinco unidades. Consulta posterior de solo lectura: cuatro unidades físicas, establecimiento DISPONIBLE con horario 00:00–00:00 y pedido CONFIRMADO con QR. | La consulta posterior no reconstruye el estado de Redis, ni prueba el resultado del GET abortado. |
| Regresión del producto | No se demuestra una regresión nueva: no se recibió JSON de rechazo, inventario vacío o estado incorrecto. | Tampoco se descarta un problema de latencia del producto. Requiere aislarlo en un entorno estable. |

La consulta posterior se hizo en una única transacción `READ ONLY`, con límite
local de sentencia 2s y bloqueo 1s; no cambió datos o configuración persistente.
No ejecutó el handler HTTP ni un nuevo checkout/pago.

## Decisión y condición antes de repetir

No hay una corrección funcional justificada por estos registros. No se cambian
negocio, pruebas, imágenes, datos, timeouts, reintentos ni velocidad demo. Añadir
una pausa extra, extender el clic o repetir GET/pagos no resolvería la causa
desconocida. El fallo y las evidencias anteriores se conservan.

Antes de autorizar otro recorrido se necesita una **línea base de solo lectura
de al menos 60s** sobre el CU-015 existente, después de que su responsable aporte
capacidad estable sin intervenir otros proyectos desde este encargo:

1. Registrar memoria disponible/swap en VM y host, OOM y contadores de reinicio
   al inicio y final. Debe existir reserva sostenida; se rechaza como línea base
   estable seguir prácticamente sin swap como en estas muestras o aumentar
   reinicios/OOM. No se inventa un mínimo de RAM certificado por este único caso.
2. Confirmar los mismos once servicios saludables y los datos del menú. No
   reconstruir ni resembrar para conseguirlo.
3. Con una sesión Cliente propia vigente, hacer **tres GET independientes**, sin
   reintentos, del mismo catálogo por gateway, espaciados 30s. Cada uno debe
   devolver 200 y JSON válido con el producto activo y disponibilidad fiable
   antes de los **15s existentes**. Conservar duración, errores y logs de toda
   la ventana; no seleccionar solo lecturas exitosas.
4. No aceptar esa línea base si coincide con nuevos timeouts DNS/SQL. Si falla,
   conservarla y no ejecutar el caso. Para aislar gateway frente a Núcleo podrá
   compararse una lectura directa del mismo catálogo con la misma sesión y sus
   logs, únicamente en el montaje CU-015.

Al cerrar el diagnóstico inicial, esta línea base **no se había ejecutado** y
no había capacidad estable acreditada. Si el GET vuelve a fallar con esa
reserva y sin incidentes concurrentes, la siguiente investigación debe recoger
correlación de petición, espera de pool, locks/SQL y Redis del handler; no cambiar
negocio por descarte. Este diagnóstico no requiere ni propone operar ZeroTier/A/B,
detener Redash, reducir guardas o repetir aceptaciones completas.

Evidencia principal privada:
`App/e2e/.evidencia/demo-2026-11-17T04-43-07-791Z/` y el directorio de análisis
privado asociado, con cronología, errores originales, comprobación SQL y fuentes.
Solo este resumen sin credenciales ni cuerpos privados se incorpora al repositorio.

## Línea base autorizada del 17/11, 00:34–00:35 Bogotá

Se ejecutó **una sola línea base**, con un login de la cuenta Cliente local
existente y tres GET independientes al mismo establecimiento/producto. Se usaron
conexiones nuevas, sin caché de cliente, redirecciones o reintentos, con un límite
total de **15.000 ms por petición**, incluido el cuerpo. La contraseña de
`.env.local` y el token permanecieron privados; el archivo de entorno conserva
contenido y permisos. No se usó la cuenta ni el montaje ZeroTier de Samuel.

| GET | Inicio Bogotá, 17/11 | HTTP | Duración | Datos esperados |
| --- | --- | --- | --- | --- |
| 1 | 00:34:41.429 | 200 | 217,836 ms | Sí |
| 2 | 00:35:11.666 | 200 | 10.509,682 ms | Sí |
| 3 | 00:35:41.559 | 200 | 495,723 ms | Sí |

Cadencia nominal 30s; las marcas de inicio HTTP reflejan separaciones reales de
30,237 y 29,893 s por planificación/E/S. No se hizo otra serie para sustituir
resultados. Se validaron lista JSON, producto único esperado y establecimiento,
nombre, activo, físico/disponible **4**, reservado **0** y estado de inventario
**DISPONIBLE**. Las tres lecturas cumplieron el plazo; no hubo timeout HTTP.

**La condición de estabilidad no pasó y no se ejecutó Playwright:**

- Cuatro muestras durante la ventana: memoria disponible en VM **197–311 MiB**;
  swap libre **0–664 KiB**. El host conservaba unos 12,4 GiB de disco disponible
  y la consulta de presión indicaba 37 % de memoria libre; no se confunde ese
  porcentaje del host con la reserva del motor Docker, de unos 2912 MiB.
- El contador global `oom_kill` de `/proc/vmstat` pasó **1231→1233**: dos muertes
  OOM registradas por el kernel de la VM. No se identificó su contenedor víctima
  mediante los eventos Docker disponibles. No se atribuyen a CU-015 ni se
  equiparan automáticamente a los siguientes reinicios.
- Se observaron **+1 reinicio** en gateway de `hexacore-infra` y **+1** en scheduler
  de Redash. No hubo intervención sobre esos proyectos. Los once servicios
  CU-015 permanecieron saludables en las cuatro muestras.
- Logs propios de la ventana: **cuatro líneas de timeout DNS** del gateway y
  **dos líneas de timeout SQL**, una de PostgreSQL y otra de Núcleo; estas dos
  fuentes pueden describir el mismo incidente. Los errores de SQL y parte de
  los de DNS coinciden aproximadamente con la segunda lectura, que tardó
  10,51s. La coincidencia no identifica una causa única para esa demora.

Resultado: **GET 3/3 aprobados; estabilidad no acreditada; recorrido visible no
iniciado**. Las respuestas correctas no borran OOM, reinicios o timeouts
concurrentes, ni demuestran que la RAM fuera la única causa del fallo anterior.

La condición pendiente es aportar reserva sostenida y verificar una ventana
de al menos 60s sin nuevos OOM/reinicios ni timeouts DNS/SQL, además de las
lecturas de catálogo válidas dentro de los 15s existentes. No se cambia capacidad,
se detienen otros proyectos o se repite otra línea base desde este encargo.
Se conservan 1000/2500 ms y los límites/reintentos de producto y Playwright.

La captura inicial de inventario tuvo un error al leer `Health` opcional en
contenedores sin esa propiedad. Se corrigió únicamente el lector privado y se
verificó mediante lectura de inventario **antes de cualquier login o GET**.
El error original se conserva; no hubo una segunda serie de peticiones.

Evidencia completa en el directorio privado `linea-base-cu015-20261117-003116/`:
inicio/fin de cada lectura, cuerpos privados, sesión privada, muestras de recursos,
contadores, logs originales, eventos disponibles y decisión de no ejecutar E2E.
No se ejecutaron semillas, reconstrucciones, pagos, aceptaciones completas ni
acciones sobre ZeroTier/A/B. No se modificó código de producto.

## Ensayo completo tras cambio de condiciones — 17/11, 01:16 Bogotá

El usuario autorizó una ventana temporal de capacidad y restauración. Se
comprobaron trabajos activos, se conservaron proveedores y se detuvieron
ordenadamente 18 aplicaciones del manifiesto. Después hubo 60s estables: tres
GET 200 válidos en 91/49/49 ms, MemAvailable 1795–1874 MiB, swap libre 463–470 MiB,
sin nuevos OOM/reinicios ni timeouts DNS/SQL propios.

Con esa condición distinta se ejecutó el mismo comando dirigido una vez:
**1/1 aprobado, salida 0, 119,13 s totales**, con 1000/2500 ms, mismos límites y
cero reintentos. Completó las 18 etapas y los cambios de actor, incluida la
recarga de productos que falló antes. No se cambió negocio para conseguirlo.

Se restauraron 18/18 y se conservaron los 111 IDs/imágenes/configuraciones/
montajes/estados iniciales. Se conservan todos los resultados anteriores. La
mejora con menor carga no aísla una causa única ni convierte la coexistencia
posterior en estable. [Procedimiento, evidencia y límites de restauración](DEMO-CU015-SUSTENTACION.md).
