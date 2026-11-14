# Autorización por recurso de Parqueaderos — 13/11/2026 Bogotá

**25/25 operaciones por gateway y Núcleo directo; global 113/159, 46 pendientes.**
El inventario conserva 178 declaradas / 173 expuestas / 159 protegidas. RNF-05/06
siguen parciales. [Evidencia permitida](PARQUEADEROS-RECURSOS-EVIDENCIA.json) y
[tabla completa](COBERTURA-RECURSOS.md).

## Brecha y cambio acotado

En la imagen inicial se aplican ingreso y salida offline del evento A, con
controles positivos propios en B. Al reenviar sus IDs existentes bajo B,
ambas respuestas son REPETIDO y devuelven la estancia de A. Reproducido en
gateway y Núcleo: dos asociaciones incorrectas por canal; SQL no cambia.

`AccesosService.porRegistroLocal` lee también el evento y exige que coincida
antes de devolver una estancia. Un ID de otro evento responde por registro
`RECHAZADO / REGISTRO_LOCAL_INCOMPATIBLE`; no se expone la estancia original.
La comprobación se comparte con salida y con la recuperación del conflicto
único concurrente de ingreso. No cambian índices, unicidad global, DTO, estados,
reglas temporales, atomicidad por registro, cálculos ni límites financieros.

Regresiones: un caso HTTP nuevo en `test/parqueaderos/parqueaderos.e2e-spec.ts`
con ambos IDs, estados intactos, reenvío A idempotente y salida B con clave
nueva; una unitaria cubre la ocupación concurrente del ID entre consulta e INSERT.
Las tres finales repiten la regresión con datos independientes en ambos canales.

## Contratos comprobados

- Reservas nuevas atribuidas a la sesión pese a query/cabeceras falsas; cuerpo
  con propietario desconocido se valida aparte. Clientes distintos: listado,
  detalle pendiente/confirmado y pago ajeno, antes del primer pago propio.
  Un pago aprobado, QR propio, repetición idempotente y bloqueo Redis liberado.
- Roles operativos **globales**: Organizador/Personal actúan también sobre el
  evento creado por otro Organizador. Cliente no administra ni opera; Personal
  no modifica tarifa, zonas, espacios, redirecciones, ni consulta el SSE.
  Disponibilidad compartida para los cuatro roles y sin sesión 401.
- IDs existentes cruzados: zonas al reservar/ingresar/editar/borrar/redirigir,
  espacios al editar y sus códigos al ingresar, redirección al cerrar, placa
  abierta y QR pagado de otro evento. Controles válidos vinculados al evento.
  Filtro de espacios con zona B en A devuelve vacío; en B devuelve sus espacios.
- Zonas/espacios/asignaciones, vehículos abiertos e históricos, caché con hash
  del QR y sin código crudo, recomendación/ocupación/redirecciones limitados al
  evento. Autoría SQL de reserva, ingreso, salida, zona, tarifa e historial usa
  actores de sesión. La salida prepagada no cobra; la ordinaria liquida una hora
  con la tarifa existente y conserva todo el libro financiero sin nueva pasarela.
- Offline: un lote válido denegado a Cliente aplica luego con Personal y los
  mismos IDs; orden cronológico, reenvío del evento original, cruce de IDs,
  zona ajena y hora fuera de rango. Zona/hora corregidas aplican con el mismo
  ID rechazado. Cada registro conserva su resultado; no se exige nueva atomicidad.
- SSE: sesión válida recibe `event: ocupacion` con el evento correcto; Cliente
  y Personal reciben 403. Tras revocar la sesión, la conexión abierta sigue
  emitiendo y una nueva recibe 401. Es autorización al conectar, **sin garantía
  de revocación continua del flujo**. AbortController, temporizador, reader y
  lock se cierran explícitamente, sin esperar EOF ni networkidle.

Por final: **300/300 observaciones** = 292 semánticas, dos DTO, dos temporales
y cuatro de observación de revocación SSE. **116 comparaciones conservadas**:
102 rechazos HTTP de autorización/contexto, cuatro lotes con rechazo semántico,
dos temporales, dos DTO y seis reenvíos autorizados idempotentes. Los 400 por
DTO y las reglas de tiempo no acreditan autorización. SQL incluye reservas,
espacios, estancias, asignaciones, redirecciones, tarifa, contenido/propiedad de
avisos y transacciones asociadas; Redis compara valor y PEXPIRETIME absoluto.
Timestamps/intentos de entrega asíncrona de avisos se excluyen de esa igualdad.

## Aislamiento y reproducción

La base CU-015 conservada tenía **cero tarifas**. Se conserva intacta. Para
acreditar PUT tarifa y reservas/pagos se crean una base **vacía nueva**, Redis
con volumen nuevo y vhost RabbitMQ nuevo; se aplican migraciones sin semillas.
Núcleo de ensayo usa imagen inicial y luego imagen corregida con etiqueta
exclusiva. El gateway original se reanuda y resuelve el alias del Núcleo nuevo;
el Núcleo original permanece detenido. Solo proveedores simulados existentes.
Siete cuentas nuevas; eventos/recintos y todos los recursos de negocio nuevos.
Sin DROP, TRUNCATE, FLUSH, down, rm, prune ni cambios de credenciales/config previa.

Seguir primero la [guía local](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md):
registrar Docker/IDs/imágenes/montajes/estados y alternar únicamente Redash.
Reanudar solo PostgreSQL/Redis/RabbitMQ/correo/pasarela CU-015 originales, con
su Núcleo detenido y el puerto 13149 libre. Node debe ser **22.22.3**.

```bash
export SEGURIDAD_SALIDA="$PWD/App/infra/informe-atributos/seguridad/.privado/parqueaderos-NUEVA-VENTANA"
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs iniciar
node App/infra/informe-atributos/seguridad/preparar-parqueaderos.cjs
```

`sondear-parqueaderos.cjs` documenta exclusivamente la reproducción **anterior**,
contra la imagen que contiene la brecha; debe detenerse si esa condición no
existe. Compilar la corrección en una etiqueta propia y sustituir solo el
Núcleo descartable; conserva detenido el anterior:

```bash
npm --prefix App/backend run build
docker build -t hexacore-seg-parq-nucleo:autorizacion-evento -f App/backend/Dockerfile App/backend
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs cambiar-imagen hexacore-seg-parq-nucleo:autorizacion-evento
npm --prefix App/backend run lint
npm --prefix App/backend test -- --runInBand --testPathPatterns=modulos/parqueaderos
node App/infra/informe-atributos/seguridad/inventario.cjs "$SEGURIDAD_SALIDA/inventario-parqueaderos.json"
python3 App/infra/informe-atributos/seguridad/finales-parqueaderos.py
node App/infra/informe-atributos/seguridad/parqueaderos-entorno.cjs parar
./App/infra/cu015.sh parar
```

Finales seriales sin reintentos, sin sobrescribir evidencia o ampliar límites:
HTTP/SSE 10 s, SQL 3 s, Redis 2 s. Misma imagen/fuentes/Node, siete servicios
del ensayo activos, Redash detenido, 20 JS de Parqueaderos coincidentes con dist
y cuatro archivos efectivos del gateway contrastados (solo CORS local generado).
Memoria antes/después registrada; no se ejecuta DAST ni los 16 recorridos locales.

`restaurar-parqueaderos.py` reanuda una vez los siete Redash iniciales, con
sondas acotadas y sin reinicios de recuperación. Compara los 92 IDs/imágenes/
montajes/estados; los contadores de reinicio se registran por separado, pueden
cambiar automáticamente. En esta ventana el primer control del arnés confundió
esa observación con una condición de restauración: se conservó el fallo y se
auditó después solo por lectura, sin repetir arranques. La evidencia pública
incluye el control posterior; un HTTP 200 puntual no elimina el bloqueo histórico
por OOM/capacidad. Docker queda activo; tres contenedores nuevos detenidos,
base/vhost/volumen y datos de ensayo conservados.

Los archivos crudos permanecen en `.privado` ignorada. `resumir-parqueaderos.py`
exporta solo campos permitidos y exige las tres finales aprobadas, inventario
exacto, tarifa previa intacta y auditoría de restauración. El resultado guarda
los fallos previos de arnés/tipos/procedencia/restauración sin ocultarlos.
No implica cobertura total de combinaciones, carreras, autenticidad de reloj/
dispositivo, CU-028/F12, no repudio, ni RNF-05/06 completos.
