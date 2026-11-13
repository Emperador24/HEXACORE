# Alimentos dentro de Núcleo

Fuente única trasladada desde `App/services/alimentos`. Conserva catálogo,
menú, checkout, inventario/reservas, adaptador local de Pagos y confirmación
con QR/evento. CU-015 incorpora establecimientos y CU-012 productos, menú y
ajustes durables. CU-013 incorpora preparación hasta listo, tiempos, incidencias
y avisos web/app; CU-014 añade prevalidación QR y entrega única. CU-011F añade
cancelación por Personal, reembolso durable y seguimiento web/app. La recuperación
global de pagos originales inciertos F12 sigue pendiente.

Instalar, compilar, migrar y arrancar desde [el workspace](../../README.md).
Usa la conexión TypeORM `alimentos`, esquema `alimentos` y POSTGRES_BD común.
Se conservan las dos migraciones históricas y se añaden
`GestionEstablecimientosCu0151794300000000`, `MenuInventarioCu0121794400000000`
`PreparacionCu0131794500000000`, `EntregaCu0141794600000000` y
`CancelacionCu011F1794700000000`
a la preparación central. POSTGRES_BD_PEDIDOS se rechaza. La preparación se
ejecuta una vez para los once esquemas (36 migraciones; 18 procedencias intactas).
El cliente Redis de inventario conserva sus opciones específicas.
Ver [inventario](inventario/README.md) y [pruebas aisladas](../../test/README.md).

## CU-011F: cancelación y reembolso

Personal activo y vinculado puede usar POST/GET
`/api/v1/pedidos/establecimientos/:local/pedidos/:pedido/cancelacion`, incluso
con el local cerrado. POST requiere `Idempotency-Key` UUID y
`{version, motivo, confirmar:true}`. Revalida autorización, confirmado/cobro
aprobado y ausencia de entrega bajo bloqueo; la transición conserva originales
y produce historial/aviso durable. Impide preparación/entrega y oculta el QR
utilizable en seguimiento y comprobante.

La devolución es otra operación: PENDIENTE/APROBADO/RECHAZADO/INCIERTO según
evidencia de la API pública local de Finanzas. No se mantienen bloqueos SQL
durante la llamada ni se reenvía una intención ya intentada sin garantías del
proveedor. Solo preparación no iniciada y consistente permite ajustes durables
CU-012 de restitución; preparado no se reincorpora y ambiguo requiere revisión.
Política completa, ventanas de caída y contratos:
[DECISION-CU011F.md](recepcion/DECISION-CU011F.md).

## CU-015: contrato y reglas

Todas las rutas administrativas parten de `/api/v1/pedidos/admin/establecimientos`.
El backend exige sesión RS256 vigente, no revocada, con rol **Organizador o
Administrador**. Ambos gestionan establecimientos de los eventos existentes;
el SRS no define una propiedad de evento adicional. El gateway conserva su
autenticación y el backend vuelve a comprobar el rol, incluso por acceso directo.

| Método / sufijo | Comportamiento |
|---|---|
| GET `?eventoId=UUID` | Lista administrativa completa, incluidos los no disponibles |
| GET `/:id` | Ficha, horario y disponibilidad efectiva al consultar |
| POST | Registra nombre, contacto, puntoEntrega, eventoId, estado, horaApertura, horaCierre, zonaHoraria |
| PUT `/:id` | Edita la ficha completa; el evento es inmutable para conservar la trazabilidad de pedidos |
| PATCH `/:id/estado` | Cambia exclusivamente estado |
| PUT `/:id/personal/:usuarioId` | Vincula una cuenta existente, activa y con rol Personal |
| DELETE `/:id/personal/:usuarioId` | Revoca el vínculo; respuesta 204, idempotente |

Nombre único por evento, ignorando mayúsculas y espacios repetidos/exteriores.
La base impone la unicidad incluso bajo concurrencia (409, CU-015A). Otros eventos
pueden reutilizar el nombre. Los campos obligatorios se normalizan y validan;
horas usan `HH:mm`, zona IANA validada con Intl, no el TZ del servidor (CU-015B).
No se aceptan atributos adicionales ni identidades/precios enviados para otra operación.

**Horario diario**: intervalo `[apertura,cierre)` en la zona almacenada.
Si cierre < apertura cruza medianoche; horas iguales significan 24 h. No hay
calendario semanal ni excepciones por festivos definidos en el SRS. En zonas con
cambio estacional se aplica el reloj local de cada instante: horas repetidas
cuentan ambas, horas inexistentes no se inventan. Valores históricos se amplían
con 00:00–00:00, America/Bogota y contacto «Pendiente de actualizar»; se conservan
su estado, punto de entrega e identidad. No se infiere un contacto real.

**Evento vigente**: `ConsultaEventos.paraAlimentos` es una interfaz pública de
Eventos/Recintos. Allí se comprueba existencia, publicación y fin exclusivo.
Se admiten pedidos anticipados de un evento publicado hasta su fechaFin; no se
introduce una regla de inicio que no existía en CU-011. Registrar/asociar exige
existencia, también para planear un borrador; recibir pedidos exige disponibilidad.
`eventos_referencia` se mantiene únicamente por compatibilidad de la FK histórica.
No autoriza por sí sola pedidos; un evento ausente en su dueño devuelve 404.
Los datos antiguos sin evento vigente requieren revisión con el dueño del evento,
no una migración que invente eventos ni un fallback a semillas.

**Efecto inmediato** (CU-015C/D): catálogo, productos y checkout consultan estado,
horario y evento reales. No hay caché de disponibilidad. Checkout bloquea la fila
del establecimiento en modo compartido; editar/cerrar usa bloqueo exclusivo.
Un cierre espera pedidos ya admitidos y bloquea los posteriores. Un menú abierto
antes del cierre tampoco permite crear un pedido nuevo. Los pedidos existentes,
sus pagos, reservas, QR y snapshots siguen su flujo; no se cancelan ni reembolsan
al cambiar el establecimiento. El portal informa que se conservan.

**Personal CU-012–014**: vínculo N:N en `personal_establecimiento`, con cuenta
existente y autor de asignación. Las rutas actuales de menú y recepción exigen
sesión Personal, cuenta activa según Identidad y vínculo al establecimiento
solicitado. Revocarlo corta la siguiente petición; Administrador con rol Personal
tampoco obtiene acceso operativo global. No cambia la gestión global de roles ni
implementa los permisos dinámicos pendientes de Samuel (CU-028). CU-015 incorpora
la consulta, asignación y revocación de cuentas existentes en su interfaz.
`GET pedidos/mis-establecimientos` devuelve únicamente los vinculados al Personal
activo, incluidos los cerrados. La autorización de gestión es el vínculo; estado
operativo y horario determinan la recepción pública, no revocan ese vínculo.

**Actualización**: migración aditiva, synchronize/migrationsRun=false. Un duplicado
histórico ambiguo aborta transaccionalmente la nueva migración, conservando datos;
debe resolverse con su dueño antes de reintentar. No se renombran ni borran filas.
[Demostración, pruebas y comandos](../../../e2e/README.md).

## CU-012: productos y ajustes

Rutas bajo `/api/v1/pedidos/establecimientos/:establecimientoId`, todas con
sesión Personal activa y `PersonalDelEstablecimiento`, también por acceso directo.
Producto y operación se buscan por su ID **y** el establecimiento autorizado.

| Método / sufijo | Contrato |
|---|---|
| GET `/menu` | Activos e inactivos, restricciones, físico, reservado, disponible y estado de lectura |
| POST `/productos` | nombre, descripción opcional, precio textual, restriccionesAlimentarias[], activo, cantidadInicial física; exige `Idempotency-Key` UUID |
| PUT `/productos/:productoId` | Metadatos y estado completos; nunca escribe cantidades |
| PATCH `/productos/:productoId` | Compatibilidad: únicamente `{activo:boolean}` |
| POST `/productos/:productoId/ajustes` | `{delta:entero,motivo:texto}` y `Idempotency-Key`; 200 aplicada, 202 pendiente o 409 rechazada |
| GET `/ajustes` | Últimas 50 operaciones del establecimiento, actor, motivo, cantidades, resultado y fechas |
| GET `/operaciones/:operacionId` | Recuperar/consultar la misma intención, sin duplicar delta |

Nombres únicos por establecimiento, ignorando mayúsculas y espacios repetidos.
Precio positivo como texto decimal (máximo 9999999999.99), nunca float; cantidades
enteras 0–2147483647 y deltas no nulos dentro del rango firmado. Restricciones:
hasta 20 textos únicos de 1–100 caracteres. Cambios de precio, descripción,
restricciones, nombre o activación no modifican snapshots ni total de un checkout
existente. Este puede pagarse tras la desactivación usando lo acordado.

`cantidadInventario` conserva el físico por compatibilidad. Los clientes nuevos
usan `cantidadFisica`, `cantidadReservada` y `cantidadDisponible`; los dos últimos
son null si hay intención pendiente, Redis no responde o la lectura no es fiable.
No sustituyen disponibilidad desconocida por físico. El catálogo agrega
restricciones y disponibilidad real y solo incluye activos. Una intención pendiente
rechaza checkout **antes de insertar pedido/reserva**, con 409
`AJUSTE_INVENTARIO_PENDIENTE`; no es un resultado incierto de compra.

El primer producto queda preparado por la operación normal, incluso con cantidad
cero. Incorporar otro producto no reinicializa los demás. El ajuste registra
intención antes de Lua, modifica un solo contador con resultado idempotente, exige
AOF local confirmado y cierra físico/resultado en la misma transacción SQL.
Los fallos dejan intención durable y bloquean admisión hasta recuperarla. La
[decisión CU-012](inventario/DECISION-CU012.md) detalla estados técnicos, bloqueos,
consumo/liberación pendientes y límites de recuperación. No implementa F12.


## Preparación CU-013 y entrega CU-014

CU-014 reutiliza la bandeja privada y añade POST
`/pedidos/establecimientos/:id/entregas/prevalidar` (`codigoQr`, 64 hex) y
`/entregas/confirmar` (`pedidoId`, `version`, `puntoRevision`, `codigoQr` y cabecera
UUID `Idempotency-Key`). Prevalidar devuelve productos/punto sin consumo; confirmar
revalida cuenta Personal/rol/vínculo, punto, pago SQL, listo e incidencias dentro
de la transacción. Una fila única por pedido, historial y aviso se guardan juntos.
Recuperar una operación existente puede omitir el QR; jamás crea una entrega nueva.
El código solo viaja en POST y memoria. Se conserva la referencia original para
el replay financiero, pero `qrUtilizable=false` y ENTREGADO impiden reutilizarla.
La consulta Cliente oculta el QR entregado. No modifica inventario, pagos ni snapshots.
Contrato, caché de huellas sin autoridad y alternativos: [decisión CU-014](recepcion/DECISION-CU014.md).

El hito previo obtuvo el conjunto CU-012/015 4/4, recuperación y CU-011 9/9;
SQL/DNS/499 siguen abiertos. [Decisión de preparación](recepcion/DECISION-CU013.md)
y [plan/mediciones](../../../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).
La ficha completa incluye entrega: preparación llega a LISTO_PARA_ENTREGAR y
[CU-014](recepcion/DECISION-CU014.md) registra su entrega única y el aviso.
CU-011F integra la cancelación descrita arriba; F12 global sigue pendiente.

`pedidos.estado` sigue CONFIRMADO durante preparación. El nuevo avance separado
es RECIBIDO (versión 0 histórica) → EN_PREPARACION → LISTO_PARA_ENTREGAR.
Se comprueba una aprobación persistida, importe y moneda; no se acepta el estado
financiero del cliente. El replay de pago mantiene cobro, descuento y QR.

Personal activo/vinculado, incluso con establecimiento cerrado:

- `GET /pedidos/establecimientos/:establecimientoId/pedidos?pagina=0`: páginas de 100 confirmados/cancelados,
  sin cliente ni QR. Incluye avance, versión, pago acreditado y cantidades históricas.
- `GET .../pedidos/:pedidoId`: detalle operativo, incidencias e historial (últimos 100 cambios).
- `POST .../pedidos/:pedidoId/preparacion`, UUID `Idempotency-Key`, cuerpo
  `{accion,version,minutos?,motivo?,productoId?,incidenciaId?}`. HTTP 200 con
  `{id,pedidoId,accion,creadoEn,preparacion}`. Acciones: INICIAR, RETRASAR, LISTO,
  INCIDENCIA y RESOLVER_INCIDENCIA. Datos ajenos a la acción se rechazan.

INICIAR recibe 1–240 minutos desde el reloj PostgreSQL. RETRASAR añade 1–240
minutos a `max(estimación anterior, ahora)` y exige motivo. La versión desactualizada
se rechaza 409; repetir UUID/petición retorna el resultado original sin nuevos
avisos ni tiempos. Otra petición con ese UUID se rechaza. Historial y aviso
se confirman en la misma transacción; no hay HTTP, Redis ni broker dentro.

INCIDENCIA solo durante preparación; un producto opcional debe pertenecer al
detalle. No se deduce un faltante porque disponible sea cero. Una incidencia
abierta bloquea LISTO y requiere resolución motivada. No sustituye, cambia
importes, cancela o reembolsa. Un cancelado/expirado/no pagado no avanza.

Cliente autenticado:

- `GET /pedidos/mis-pedidos?pagina=0`: páginas de 100 de su cuenta, desde cero.
- `GET /pedidos/mis-pedidos/:pedidoId`: detalle, misma estimación/QR y avisos
  persistidos. El QR solo se proyecta a su dueño cuando el pedido está confirmado
  y su pago acreditado, sin entrega registrada; otra cuenta recibe 404. No incluye actor en los avisos.

El canal es dentro de web/app, sin promesa de correo/push. Las consultas derivan
retraso del reloj, sin emitir avisos en cada refresco. La bandeja lee SQL y conserva
los pedidos aunque falle la publicación RabbitMQ. Los confirmados históricos sin
fila nueva se proyectan RECIBIDO; si no tienen pago acreditado no se habilita avance.
Los cierres al público no impiden gestionar pedidos existentes. Ninguna operación
de preparación modifica pedidos, snapshots, importes, stock o pagos.
