# Evacuación y Monitoreo — 15/11/2026 Bogotá

**22 operaciones nuevas (16 Evacuación, 6 Monitoreo), dos SSE. RNF-05/06 parciales.**
[Métodos y rutas](COBERTURA-RECURSOS.md), [resultados](RESULTADO.md) y
[evidencia permitida](OPERACION-EVIDENCIA.json). Tras integrar develop 36998aa
por fast-forward (PR #51 y #52 ya integrados), hay **186 declaradas / 181 expuestas
/ 167 protegidas**. CU-028 añadió ocho protegidas: siete admin/roles y
GET cuentas/permisos. Las 129 anteriores se conservan como evidencia de sus
combinaciones probadas; estas 22 llevan el total a **151/167, 16 pendientes**.
La matriz dinámica no agota todas las combinaciones de roles anteriores.

## Permisos y asociaciones

Organizador y Administrador supervisan las 22 operaciones. Personal solo tiene
GET activa del evento, PATCH reporte de zona y POST bloqueo de salida, según los
decoradores vigentes. Dos cuentas Personal propias prueban esas tres operaciones
sin asignación Personal-evento; actores distintos leen u operan recursos nuevos
de otros actores. No se inventa propiedad por creador ni aislamiento organizativo.

CU-028 ya integrado suma permisos propios: `emergencias` y `reportes`, acción
leer/crear/actualizar. Los POST confirmar/descartar/ruta/bloqueo/nivel/finalizar
declaran actualizar; proponer y registrar decisión usan crear. Se comprueban
lector, creador y actualizador exclusivos; retirar leer por la API de roles corta
los SSE abiertos con la misma sesión. Esas peticiones preparan/comprueban el
contrato vigente y **no** declaran cubiertas las ocho rutas nuevas de CU-028.

La matriz usa eventos publicados, planes completos, propuestas o evacuaciones
activas según la acción y finaliza solo después de evacuar todas sus zonas.
Evacuación no declara un campo version: se respeta su contrato de estado y
bloqueo de fila. Se cruzan zonas, salidas, evacuaciones, eventos, alertas y
decisiones existentes. Un 404 por asociación ajena es contexto, separado de
autorización; DTO/estado/inexistencia no acreditan acceso.

Cada final tiene **510 observaciones**: 470 semánticas, 32 contexto, 4 DTO y
4 estado. **216 rechazos de autorización** (214×403 y 2×401), positivos de las
22 rutas para **cada supervisor y cada canal**. **256 comparaciones completas**,
128 por canal, sobre las **76 tablas** de once esquemas de negocio, historial,
avisos y entregas, versiones, planos SHA-256/metadatos, secuencias y Redis
DUMP binario/expiración absoluta y reloj del servidor. La lectura Redis es
atómica; se registra aparte únicamente la desaparición cuyo TTL ya venció.
Cambios de valor/TTL, claves nuevas y borrados anticipados se rechazan. Se espera solo la estabilización de avisos propios
antes de comparar, incluido el acuse del outbox de Eventos; no se excluyen fechas
ni contadores. El outbox de Eventos
incluye también el acuse que el capturador histórico excluía.

## Dos SSE: reproducción y corrección

Antes de corregir, revocar realmente la sesión permitía otro estado nuevo:
Evacuación **2009/1999 ms** y Monitoreo **3001/3006 ms**, gateway/Núcleo. Un
segundo supervisor cambió nivel/decisión después de revocar; la conexión nueva
recibió 401. Reproducción con propuestas nuevas, sin activar ni emitir avisos.

`FlujoOperacionService` adapta el patrón probado de Parqueaderos: usa
`SesionValida.validar(token, acceso)` común, con roles/permisos actuales. Revalida
en el ciclo original **2 s / 3 s** y antes de emitir; comparte la comprobación
pendiente y no apila estados. La seguridad sigue activa mientras la consulta está
pendiente. Invalidar desuscribe trabajos/temporizadores y descarta sus resultados
tardíos. Desconectar y cerrar el módulo completan suscripciones abiertas.

HTTP inicial conserva 401/403/503. Una conexión iniciada conserva HTTP 200 y
recibe un único `sesion_finalizada` saneado seguido de EOF: SIN_AUTENTICAR,
ROL_INSUFICIENTE, SESIONES_NO_DISPONIBLES o FLUJO_NO_DISPONIBLE. Mensajes fijos,
sin errores internos o token. Acceso siempre Bearer en cabecera. Un recurso
inexistente dentro del observable también termina saneado; no filtra el error.

Detección periódica, **no instantánea**: ciclo 2/3 s + Redis hasta 2 s + transporte.
Espera completa de estado 5 s, igual presupuesto de Parqueaderos; consultas
propias del flujo con SET LOCAL statement_timeout 2 s en transacción. HTTP normal
y pools de otros módulos conservan sus límites. Las promesas de interfaces
externas no se cancelan arbitrariamente: se descarta su resultado tardío y se
verifica liberación al terminar. No se certifican los tiempos de RNF-17.

SSE real por ambos canales: dos datos nuevos del recurso correcto, revocación
real, JWT fixture de exp cinco segundos (firma/validador/Redis/HTTP reales, sin
cambiar reloj ni TTL productivo), retirada de permiso propio por API, Redis
CLIENT PAUSE 6500 ALL solo en instancia nueva, consulta bloqueada de cobertura
en la base nueva, desconexión y SIGTERM con cuatro flujos abiertos. Redis vuelve
por fin programado; no hay recuperación de proveedores mediante reinicios.
SIGTERM conserva **5 s**, mismo contenedor reanudado como paso previsto del caso.
Una regresión HTTP acotada por canal conserva el SSE de Parqueaderos.

Los consumidores reutilizan `seguirFlujo`: reader/lock liberados, terminal 403
diferenciado, frames posteriores descartados. Ante 401, una renovación existente
por cookie hasta recibir datos válidos; otro rechazo detiene reconexiones.
403/503 terminales detienen reconexión, sondeo y renovación periódica. Cambio de
recurso/destrucción invalida renovaciones pendientes; transporte conserva backoff.
Pruebas del cliente son dobles en Chrome Headless, separadas de las medidas HTTP.

## Aislamiento y ejecución

Seguir [la alternancia](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md)
y registrar estados actuales, sin asumir los de otra ventana. Base vacía,
migraciones sin semillas, Redis/volumen/vhost exclusivos y nueve cuentas nuevas.
Antes de activar, comprobar que todos los usuarios son esos nueve. Los avisos
PERSONAL/ASISTENTES/ALTAVOCES solo circulan por la cola simulada de ese vhost;
no hay destinatarios previos ni push/SMS/altavoces externos. No añadir filtros
artificiales al producto para poder ejecutar un ensayo en la base habitual.

Con SEGURIDAD_SALIDA absoluto, nuevo e ignorado, Node 22.22.3 y proveedores propios
simulados; compilar etiquetas **exclusivas** y seguir las guardas del entorno:

```bash
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs iniciar hexacore-seg-parq-nucleo:operacion-anterior-FECHA
node App/infra/informe-atributos/seguridad/preparar-operacion.cjs
node App/infra/informe-atributos/seguridad/sondear-operacion.cjs
# Solo con versión anterior para reproducir; compilar la corregida y cambiar-imagen.
python3 App/infra/informe-atributos/seguridad/operacion-gateway.py
node App/infra/informe-atributos/seguridad/operacion-recursos.cjs desarrollo
# Esperar salida 0 antes del SSE: comparten la base nueva.
node App/infra/informe-atributos/seguridad/comprobar-operacion-sse.cjs desarrollo
python3 App/infra/informe-atributos/seguridad/finales-operacion.py cierre
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs parar
python3 App/infra/informe-atributos/seguridad/restaurar-parqueaderos.py
```

El gateway inicial renderizado no contenía los módulos dinámicos de la fuente
integrada: lector403 allí/directo200. Se conserva intacto y se usa un gateway
exclusivo actual, contrastado byte a byte (solo CORS local). `operacion-gateway.py`
usa la etiqueta exclusiva `hexacore-seg-op-gateway:operacion-20261115` previamente
compilada. El restaurador verifica los ids exactos añadidos, incluido ese gateway.
No ejecutar preparación o semillas al reanudar los contenedores conservados.

`finales-operacion.py` espera cada subproceso: matriz y SSE **seriales**, memoria
antes/después, fuentes/imágenes/24 JS Operación + 21 Parqueaderos + 3 seguridad
común contrastados. No sobrescribe finales ni reintenta. Desarrollo fallido por
gateway anterior y otra comparación invalidada por login SSE concurrente quedan
conservados; esta última solo difería en usuarios/sesiones. Serie inicial de
finales: 510/510 y SSE aprobados; segunda matriz interrumpida tras 248 por un acuse
asíncrono de Eventos, con todo lo demás igual. Se añade su estabilización a la
precondición de 3 s existente, sin ocultar campos, y se mide una serie nueva
`normalizada` se detuvo al guardar un agregado mayor que la cadena máxima de
V8. Se conservan logs, sin aumentar memoria/límites; las instantáneas completas
se guardan por comparación en gzip. La serie `compacta` tuvo primera final
aprobada y segunda interrumpida tras236 por una expiración natural de Redis.
Se adapta su comparación al reloj del servidor (seis regresiones del comparador)
y se mide `finales-operacion.py cierre`, tres completas con producto/imágenes/
límites intactos. Todos los pares crudos y sus huellas se conservan. También se conservan
errores de fixture y contador del navegador, sin atribuirlos al producto.
`resumir-operacion.py` publica únicamente campos permitidos; datos, claves,
sesiones, QR, frames y consultas crudas permanecen privados fuera de Git.
