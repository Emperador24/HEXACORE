# Alimentos dentro de Núcleo

Fuente única trasladada desde `App/services/alimentos`. Conserva catálogo,
menú, checkout, inventario/reservas, adaptador local de Pagos y confirmación
con QR/evento. CU-015 incorpora gestión administrativa de establecimientos;
CU-012 completo, preparación/entrega y F12 siguen pendientes.

Instalar, compilar, migrar y arrancar desde [el workspace](../../README.md).
Usa la conexión TypeORM `alimentos`, esquema `alimentos` y POSTGRES_BD común.
Se conservan las dos migraciones históricas y se añade
`GestionEstablecimientosCu0151794300000000` a la preparación central. POSTGRES_BD_PEDIDOS
se rechaza. La preparación se ejecuta una vez para los ocho esquemas.
El cliente Redis de inventario conserva sus opciones específicas.
Ver [inventario](inventario/README.md) y [pruebas aisladas](../../test/README.md).

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
implementa los permisos dinámicos pendientes de Samuel (CU-028). CU-012 debe
incorporar la selección/asignación de cuentas en su interfaz; aquí existe la API
acotada para preparar esa integración.

**Actualización**: migración aditiva, synchronize/migrationsRun=false. Un duplicado
histórico ambiguo aborta transaccionalmente la nueva migración, conservando datos;
debe resolverse con su dueño antes de reintentar. No se renombran ni borran filas.
[Demostración, pruebas y comandos](../../../e2e/README.md).
