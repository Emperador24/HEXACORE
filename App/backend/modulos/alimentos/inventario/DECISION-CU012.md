# CU-012: ajustes de inventario, antes de implementar

7/11/2026, America/Bogota. Base revisada: `6c9772e`, rama limpia
`feature/sebastian`. Se conservan las reservas y los contratos de CU-011/015.

## Cantidades y estados existentes

- **Físico**: `productos.cantidad_inventario` en PostgreSQL. Baja al confirmar
  el pago, no al reservar. `cantidadInventario` conserva ese significado para
  compatibilidad; no debe etiquetarse como disponible.
- **Disponible**: contador Redis por producto, ya descontadas las reservas. Es
  la autoridad de admisión de nuevas reservas. Redis no usa TTL para devolver stock.
- **Reservado físico**: diferencia físico menos disponible en una lectura
  coordinada sin ajustes pendientes. Incluye compromisos aún sin confirmar,
  liberaciones que todavía no devolvieron unidades y reservas Redis inciertas;
  no se obtiene contando únicamente filas SQL ACTIVA. Si no es posible obtener
  una lectura fiable, reservado/disponible son desconocidos, nunca el físico.
- PREPARANDO: intención SQL del checkout antes de confirmar la reserva Redis.
  ACTIVA: reserva obtenida, pedido pendiente de pago. LIBERACION_PENDIENTE:
  expiración segura decidida en SQL; falta confirmar devolución Redis. LIBERADA:
  devolución confirmada. CONSUMO_PENDIENTE: pedido y descuento físico confirmados;
  falta cerrar la marca Redis, sin devolver unidades. CONSUMIDA: cierre confirmado.
  Un consumo pendiente **ya descontó físico**; no se suma otra vez como compromiso.
  Una liberación pendiente puede haber llegado a Redis y haber perdido la respuesta.

## Mecanismo elegido

Tabla local de operaciones CU-012 con UUID de idempotencia, secuencia, actor,
producto, motivo, delta, petición canónica, estado y cantidades antes/después.
No se crea otro servicio, broker ni plataforma de almacenes.

1. Transacción SQL corta: bloqueo exclusivo del establecimiento, validar alcance
   y petición, registrar producto (físico inicial cero) e intención PENDIENTE.
   Repetir la clave con otra petición/actor/establecimiento se rechaza.
2. Procesar en secuencia por establecimiento. Bloquear establecimiento y producto
   en SQL; validar límites del físico actual. Ejecutar Lua idempotente sobre **un
   campo** Redis: incremento/decremento, comprobando que disponible no quede
   negativo ni desborde. Guardar en Redis el resultado de esa clave, incluso un
   rechazo definitivo; jamás reconstruir el hash. En la misma transacción SQL,
   exigir `WAITAOF 1 0 1500` y luego aplicar el delta físico y cerrar el registro
   como APLICADA, o guardar RECHAZADA. Se requiere Redis >= 7.2 con AOF activo;
   se verificó ese soporte en el entorno existente. El replay vuelve a escribir
   su marca (sin repetir delta) para que WAITAOF cubra el offset de esta conexión.
   Si la conexión se cierra entre Lua y su confirmación, no se acepta el offset
   de la nueva sesión: se conserva la intención pendiente para repetirla completa.
3. Si Lua/commit no pueden confirmarse, dejar la intención durable PENDIENTE.
   Un sondeo acotado dentro de Núcleo, el replay y la consulta de operación la
   recuperan. Lua devuelve su resultado previo: un commit SQL perdido se distingue
   leyendo la operación; una respuesta Redis perdida se resuelve repitiendo la
   misma clave. El delta físico y el cierre SQL se confirman juntos.

Checkout mantiene su bloqueo compartido del establecimiento y rechaza si hay una
intención administrativa pendiente. El procesador usa bloqueo exclusivo; no puede
modificar Redis durante un checkout ya admitido. Las lecturas de menú también
coordinan esos bloqueos y los productos. El pago bloquea productos y conserva sus
snapshots; el ajuste usa el físico actual bajo bloqueo. La liberación/consumo Lua
y los ajustes se serializan en Redis: reducir valida el contador realmente
disponible, incluidos los estados técnicos pendientes y respuestas perdidas.

No se afirma atomicidad PostgreSQL/Redis. La intención y el bloqueo de admisión
hacen visible y recuperable la ventana entre ambos. Un fallo puede reducir
temporalmente disponibilidad, pero no debe habilitar ventas inseguras. El sistema
no resuelve cobros financieros inciertos F12 en esta entrega.

WAITAOF confirma persistencia local de las escrituras precedentes de la conexión,
no un consenso distribuido ni recuperación de un disco perdido. Si AOF no está
disponible o no confirma a tiempo, la operación queda pendiente y no se confirma
el físico. No se elevan los timeouts existentes. Fuentes técnicas:
[WAITAOF](https://redis.io/docs/latest/commands/waitaof/) y
[Lua en Redis](https://redis.io/docs/latest/develop/programmability/eval-intro/).

## Alta y fallos

El primer producto de un establecimiento sin productos ni pedidos puede crear
su contador y marca de preparado como parte de su operación normal. Un producto
adicional solo incorpora su campo al hash preparado existente. Una ausencia
inesperada de inventario de un establecimiento con datos previos falla cerrada:
no se reconstruye ni se vuelve a ejecutar `inventario:preparar` con operaciones.

Redis caído/timeout/interrupción: intención identificable, respuesta pendiente,
venta nueva bloqueada y recuperación tras reinicio. La pérdida total de datos
Redis requiere restauración/revisión de su dueño, no una semilla automática.
Los registros de idempotencia no se expiran mientras haya operaciones que puedan
repetirse. Claves desconocidas/incompatibles y tipos Redis incorrectos no se reparan
pisándolos. Un rechazo no se transforma en aceptación al repetirlo con más stock.

## Contratos y autorización

Precio se recibe como decimal textual, normalizado a dos posiciones; sin float.
Cambios de metadatos/estado se serializan frente al checkout y no reescriben
detalles ni total de pedidos existentes. Un checkout existente puede pagarse tras
desactivar o cambiar el producto: usa lo acordado al reservar.

Gestión exige Personal activo y vínculo vigente al establecimiento. CERRADO,
SATURADO y DESHABILITADO son estados de recepción pública: no revocan el permiso
de gestión del menú. La selección de establecimientos usa el vínculo, no catálogo
público. CU-015 incorpora consulta/asignación/revocación con cuentas existentes.
Si Personal accede al portal web, solo se permiten los destinos del menú; cuentas,
roles y las otras secciones administrativas permanecen fuera de su alcance.

## Verificación pendiente

Probar instalación vacía/actualización conservando productos, reservas y pedidos;
primer producto sin comandos manuales; reservas activas/consumo/liberación pendiente;
ajustes y compras/pagos/expiraciones concurrentes; reducción insegura; repetición,
respuesta perdida y reinicio. Ampliar Playwright y Flutter, repetir CU-011/015 y
registrar resultados realmente ejecutados en PLAN-CIERRE-SEBASTIAN.md.
