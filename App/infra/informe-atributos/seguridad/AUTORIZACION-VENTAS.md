# Autorización de Compras y Reventa

Alcance: **8 rutas de Compras + 11 de Reventa**, gateway `127.0.0.1:18100` y
Boletería directa `127.0.0.1:13147`. [Cobertura](COBERTURA-RECURSOS.md),
[resultado](RESULTADO.md) y [evidencia saneada](VENTAS-RECURSOS-EVIDENCIA.json).
RNF-05/06 parciales; no implementa casos de uso nuevos ni amplía DAST o Acceso QR.

## Ejecutar sin modificar datos anteriores

Node **22.22.3** en PATH, dependencias y compilados existentes. Seguir la
[guía de capacidad](../../../../Documentation/Work/OPERACION-LOCAL-REDASH-HEXACORE.md):
registrar estado real inicial, detener solo Redash autorizado y reanudar los
once contenedores CU-015 existentes, sin semillas/preparación/reconstrucción.
Comprobar salud de gateway; conservar otros proyectos y Docker Desktop.

```bash
umask 077
export SEGURIDAD_SALIDA="$PWD/App/infra/informe-atributos/seguridad/.privado/ventas-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SEGURIDAD_SALIDA"
git check-ignore "$SEGURIDAD_SALIDA/control"
node App/infra/informe-atributos/seguridad/preparar-ventas.cjs > "$SEGURIDAD_SALIDA/preparar.log" 2>&1
python3 App/infra/informe-atributos/seguridad/finales-ventas.py > "$SEGURIDAD_SALIDA/finales.log" 2>&1
```

Reutiliza `comun.cjs`, inventario, medición de memoria, guardas CU-015 y
procedencia existentes. Crea seis cuentas nuevas (tres clientes y roles
Personal/Organizador/Administrador), contraseña aleatoria privada y evento
publicado a 30 días con localidad de 1000 cupos. Solo las cuentas se insertan
en Identidad; recinto/evento por API. Espera las proyecciones necesarias antes
de comprar. Los cupones son fixtures SQL nuevas, exclusivas del evento.
No cambia claves anteriores, no trunca ni elimina negocio, no usa proveedores reales.

Cada canal/final crea compras/publicaciones/checkouts distintos. El gateway
recibe un turno real propio para cada POST Compras; no se acredita autorización
con un 428/turno inválido. Intención y parciales privados impiden sobrescritura.
Conservar/diagnosticar cualquier fallo antes de otra serie. No reenvía HTTP ni
relaja límites: HTTP **10 s**, SQL **3 s**, Redis **2 s**. El polling de proyección
previo tiene **10 s**; no es reintento de una mutación. `procedencia-ventas.py`
exige mismas once imágenes/servicios saludables, fuentes/herramientas y **131 JS**
compilados relevantes coincidentes con los ejecutados en las tres finales.

## Contratos y controles

- La compra pertenece al comprador de sesión; lista/detalle filtran por ese
  comprador. Pago y cupón ajenos se rechazan mientras la compra sigue pendiente;
  el dueño aplica/retira el cupón y paga después, sin consumir reservas/usos ni
  claves financieras con los intentos ajenos.
- Cotización/cancelación rechazan compras ajenas y entradas existentes de otra
  compra, incluidas las del mismo cliente. La selección mixta válida conserva
  el contrato parcial: cotiza/cancela solo las propias y enumera las rechazadas;
  no cambia la entrada ni devuelve dinero de otra persona.
- Publicar exige propiedad vigente y elegibilidad. Precio/retirada se prueban
  con publicación activa sin checkout que pueda ocultar el permiso inicial.
  Listado/detalle del mercado son compartidos; el listado omite las propias.
- Checkout obtiene comprador/vendedor de sesión/publicación, incluso con body
  o cabeceras falsificados. Otros clientes y vendedor no leen/pagan/cancelan su
  checkout. El dueño recupera el mismo checkout tras el intento concurrente
  ajeno y lo cancela; otro checkout independiente se paga y transfiere.
- Tras transferir se comprueban propietario, QR nuevo distinto, dos filas de
  historial y un cobro con un intento. Detalle de compra anterior omite esa
  entrada/ambos QR; mis-entradas sigue la propiedad actual y no expone QR.
  Mercado tampoco expone QR. Vendedor anterior no cancela/republica ni administra
  el nuevo anuncio; el dueño actual sí puede publicarlo y retirarlo.

Los rechazos guardan SQL/Redis antes y después, aun si falla la expectativa.
SQL incluye compras, reservas/contadores de localidad, cupones/usos, entradas,
historial, cancelaciones, publicaciones, checkouts y libro financiero asociado.
Redis compara titular y **PEXPIRETIME**, sin confundir el paso normal del tiempo
con una renovación indebida. `FOR UPDATE NOWAIT` acredita disponibilidad de los
bloqueos SQL tras rechazar. Las claves reales son compra:intento, checkout y
cancelación; no se inventa un encabezado de idempotencia que la API no admite.
DTO (cuatro 400/final), elegibilidad (dos) y concurrencia (dos) se clasifican aparte.

## Expiración global: ámbito completo comprobado

Cliente/Personal/Organizador y sesión ausente no ejecutan el barrido; la huella
agregada SQL verifica que las publicaciones no cambian. No usa un filtro ficticio
de evento o propietario en el producto. Para el positivo, el arnés consulta
**toda** la tabla de publicaciones y todas las transacciones y comprueba que
pertenecen al evento/cuentas/entradas exclusivas de esta fixture, con cero filas
ajenas. Si falla esa condición, **no llama al Administrador** y registra 18/19
con limitación en lugar de declarar el positivo aprobado.

Con ámbito descartable comprobado crea una publicación propia nueva y prepara
solo su vencimiento por SQL. Vuelve a comprobar el ámbito inmediatamente antes
y después del HTTP Administrativo. Exige exactamente una revisada/expirada,
ninguna omitida; los demás anuncios quedan íntegros. QR, propiedad, historial,
finanzas y Redis se conservan; la entrada vuelve a VALIDA. En esta ventana las
seis ejecuciones (dos canales × tres finales) acreditan ese ámbito exclusivo.
No borra publicaciones anteriores para obtenerlo. Otra fixture en el mismo
entorno probablemente tendrá publicaciones previas: se conserva la limitación
o se prepara un ámbito realmente descartable en una entrega autorizada.

## Regresiones, exportación y restauración

```bash
npm --prefix App/backend test -- --runInBand --testPathPatterns='entradas/(ventas/venta/(compra.service|promociones.service|cancelacion.service)|postventa/postventa/(publicacion.service|checkout.service|expiracion.service)).spec'
./App/infra/cu015.sh parar
```

La ventana actual aprueba **124/124, seis suites**. Referencia histórica reutilizada:
Boletería **23/23 × dos** de CI 43523770155 / 62ffd7b con fuentes intactas;
aceptación **16/16 automática y visible** anterior, sin ejecución nueva.
Sin cambios de producto no se repiten los conjuntos completos ni se reabren
preventivamente SIGTERM/outbox. Sus fallos históricos permanecen en RESULTADO.

Restaurar una sola vez los servicios Redash inicialmente activos y el estado
de Docker Desktop, sin ciclos para buscar HTTP verde ni tocar otros proyectos.
Registrar estados, PG/Redis, HTTP, cgroups y limitación de capacidad por separado.
`resumir-ventas.py` exporta una lista positiva tras guardar `entorno-resumen.json`;
revisar el diff. Fixture, sesiones, QR, SQL/Redis crudos, logs/trazas y configuración
quedan en la carpeta ignorada. No publica datos financieros o de personas.
