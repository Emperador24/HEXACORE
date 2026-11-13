# Autorización por recurso de Alimentos

Alcance: las 30 operaciones protegidas de `modulos/alimentos`, por gateway
`127.0.0.1:18100` y Núcleo directo `127.0.0.1:13149`. No amplía DAST, no crea
casos de uso y no acredita RNF-05/06 completos. Resultado vigente y fallos:
[RESULTADO.md](RESULTADO.md), [cobertura](COBERTURA-RECURSOS.md) y
[evidencia saneada](ALIMENTOS-RECURSOS-EVIDENCIA.json).

## Preparación y ejecución

Seguir primero la [guía de alternancia](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md).
Registrar estado real de Docker Desktop, IDs/estados/imágenes/montajes de los
contenedores; detener solamente Redash autorizado. Reanudar los mismos once
servicios CU-015 con guardas, sin preparación de esquema/semillas, y comprobar
salud del gateway. Otros proyectos no se detienen. Usar Node **22.22.3** también
para el `node` invocado por Python; dependencias y compilados existentes.

```bash
umask 077
export SEGURIDAD_SALIDA="$PWD/App/infra/informe-atributos/seguridad/.privado/alimentos-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SEGURIDAD_SALIDA"
git check-ignore "$SEGURIDAD_SALIDA/control"
node App/infra/informe-atributos/seguridad/inventario.cjs "$SEGURIDAD_SALIDA/inventario.json"
node App/infra/informe-atributos/seguridad/preparar-alimentos.cjs > "$SEGURIDAD_SALIDA/preparar.log" 2>&1
python3 App/infra/informe-atributos/seguridad/finales-alimentos.py > "$SEGURIDAD_SALIDA/finales.log" 2>&1
```

El preparador reutiliza `preparar.cjs` y agrega exclusivamente otro Organizador
nuevo: siete cuentas de ensayo, contraseña aleatoria privada, evento publicado,
local/producto/pedido propios. No modifica cuentas o claves anteriores.
Proveedores de correo/pagos simulados; sin ZAP. Cada canal de cada pasada crea
dos locales y productos nuevos, con Personal distinto. Un sufijo único evita
colisiones entre carpetas que compartan las mismas cuentas durante una ventana.
Para una ventana distinta, crear una fixture nueva; no reutilizar eventos caducados.

La intención de cada medición se guarda antes del negocio; el runner rechaza
sobrescribirla incluso después de una interrupción. Conserva resultados parciales,
precondiciones y capturas. Ante fallo, detener y diagnosticar; otra serie después
de una corrección debe usar una carpeta nueva, conservar la anterior y registrar
el motivo. Nunca reenviar una mutación con resultado incierto para buscar verde.
Compartir una fixture completa de la misma ventana solo requiere copiar su
`fixture.json` privado; no repetir el preparador sobre una fixture parcial.

`procedencia-alimentos.py` reutiliza la comprobación existente de once imágenes
y salud; contrasta los 83 compilados JavaScript de Alimentos con los ejecutados,
y guarda hashes de fuentes relevantes. Las tres finales exigen la misma versión,
imágenes, compilados y herramientas, Redash detenido, ejecución serial y cero
reintentos HTTP. La lectura de convergencia del reembolso tiene **10 s**, sin
repetir cancelación/cobro. `peticion` conserva su límite de **10 s** por HTTP;
PostgreSQL **3 s** y Redis **2 s**. No cambia los límites de producto o Playwright.

## Qué acredita cada comprobación

- Cliente obtiene solo sus pedidos; el pago ajeno usa un checkout existente
  **antes de su primer cobro**, seguido de pago autorizado con la misma clave.
  La identidad sale de sesión pese a cabeceras/query falsificados. `clienteId`
  extra en checkout produce 400 y se clasifica aparte como validación.
- Personal A/B opera sus locales distintos. Productos, ajustes, operaciones,
  pedidos, QR y cancelaciones se cruzan conservando recursos existentes y cuerpos
  válidos. El 404 de ocultación tiene contraparte propia 200. La incidencia con
  producto de otro pedido produce 400 semántico y se separa como relación; no
  sustituye una comprobación de autorización. Resolver una incidencia ajena usa
  una incidencia real que su operador consulta y resuelve positivamente.
- Preparación, entrega y cancelación se intentan antes de su primera mutación
  autorizada, con versiones actuales. La entrega usa pedidos listos y QR reales
  exclusivos, sin publicarlos. Se contrasta también pedido propio con QR ajeno.
- Organizador, otro Organizador y Administrador ejercitan administración global,
  incluidos locales creados por el otro Organizador. Personal/Cliente no crean,
  editan, cambian estado ni asignan/desvinculan Personal. Auditoría usa la sesión.
  Los vínculos temporales se eliminan y A/B quedan distintos para el ensayo.
- Catálogos autenticados son compartidos por contrato. No se inventa propiedad
  individual para consultar productos/eventos ni frontera organización-evento.

Cada rechazo guarda **antes y después** SQL y Redis privados, incluso si falla
la expectativa HTTP. Compara establecimientos del evento exclusivo, vínculos,
productos, pedidos, detalles, reservas, operaciones de inventario, preparación,
incidencias, historial, entregas, cancelaciones y libro financiero enlazado a
sus cobros/reembolsos y claves intentadas. Redis incluye disponibles, preparado,
reservas, vencimientos de esos pedidos y marcas de ajustes. No incluye sesiones,
claves de otros proyectos o el contenido global de Redis. Se comprueban también
auditores de preparación/entrega/cancelación, entrega única y un reembolso con
un intento; no se exige que una lectura de seguimiento financiero sea inmutable.

## Referencia anterior a la primera cancelación

Cada canal utiliza un pedido exclusivo sin preparar. `original()` exige pedido
confirmado, un cobro aprobado en Alimentos y su libro aprobado en Finanzas, y
detalles existentes. Guarda el contenido y hash antes de cancelar y relee el
archivo. Si cualquier captura/persistencia/lectura falla, **no cancela**.

Después compara íntegramente ambos registros del cobro, todos los detalles y
todos los campos del pedido salvo `estado`, `motivo_cancelacion`, `cancelado_en`
y `actualizado_en`, que sí corresponden a la cancelación. Valida estado/motivo/
fecha de cancelación, restitución y reembolso confirmado. El QR persistido se
conserva en el acuerdo; su utilización depende del estado, según contrato.
No reconstruye el hash faltante del ensayo histórico de `interlocks-recursos`.

## Regresiones, exportación y restauración

```bash
npm --prefix App/backend test -- --runInBand --testPathPatterns='alimentos/(checkout/checkout|menu/menu|establecimientos/establecimientos|recepcion/(recepcion|preparacion|entrega|cancelacion)|pagos/pagos).spec'
./App/infra/cu015.sh parar
```

Restaurar solo los servicios Redash inicialmente activos, con los mismos IDs,
imágenes y montajes, por etapas y una sola vez. Comprobar PG/Redis, `/ping` y
`/login`; conservar incidentes, sin ciclos de reinicio. Devolver Docker Desktop
a su estado inicial. ZAP se conserva detenido porque no participa en este bloque.

`resumir-alimentos.py` selecciona únicamente campos publicables de las finales,
historial y restauración. La ventana documentada conserva `entorno-inicial.json`,
`entorno-final.json`, `alimentos-control-parcial.json` e
`historial-primera-serie.json` privados para esa exportación. Revisar siempre
el diff; fixture, cuentas, sesiones, SQL/Redis crudos, QR y logs quedan fuera de Git.

La aceptación **16/16 automática y 16/16 visible** anterior se reutiliza con
fuentes de Alimentos/Finanzas intactas desde `ec07de2`. No se repiten los conjuntos
completos por cambios del arnés/documentos. SIGTERM/outbox conservan su historia
y causa pendiente. ZeroTier queda solo como futura prueba compartida con un
servidor HEXACORE y varios clientes; no se instala ni configura.
