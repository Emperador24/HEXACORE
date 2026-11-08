# CU-014: prevalidación y entrega única

Base publicada `db6f053`, rama `feature/sebastian`. Se conserva el entorno CU-015,
las 18 procedencias y el estado financiero CONFIRMADO. La ficha vigente CU-014
completa los pasos 7–12 de CU-013; sus identificadores internos CU-003/A–G se
relacionan sin modificar el Excel ni el documento generado de requisitos.

## Autoridad y persistencia

El QR es el secreto aleatorio de 256 bits emitido por CU-011. Se recibe solo en
cuerpos POST; nunca en URL, historial o logs. Las consultas nuevas usan su SHA-256,
no el código como parámetro SQL, para evitar que el logger registre el secreto.
Una caché local acotada a 1000 huellas/estados y 30 s acelera la identificación;
se actualiza tras cada lectura SQL y confirmación local. Nunca autoriza desde
caché: incluso con una entrada vigente se releen SQL, cuenta, vínculo y pedido;
tras reinicio se reconstruye por demanda. No hay sondeo global ni caché de QR
completos. El índice de consulta incluye el establecimiento; un código de otro punto no
habilita entrega aunque el operador tenga vínculo con ambos establecimientos.
El punto autorizado es el establecimiento seleccionado y su punto persistido;
no se aceptan identidad del cliente, importes, estado ni un punto del navegador.

Prevalidar es una consulta sin consumo, aviso ni cambio de versión. Devuelve el
pedido revisable, punto y versión. Confirmar una entrega nueva exige código, pedido, versión, revisión del punto y UUID
de operación. Dentro de la misma transacción se vuelve a comprobar y bloquear
cuenta Personal activa/rol, vínculo, establecimiento y pedido; después se valida
pago aprobado persistido, CONFIRMADO, LISTO_PARA_ENTREGAR, ausencia de incidencias
y de entrega anterior, y correspondencia del secreto. Los cierres públicos no
revocan la gestión de pedidos existentes.

La entrega vive en una tabla separada con pedido como clave primaria, operación
única, actor, fecha PostgreSQL y punto guardado como snapshot. El avance de
preparación sigue LISTO_PARA_ENTREGAR; la proyección operativa muestra ENTREGADO.
Se incrementa su versión y se registra ENTREGAR en el historial/aviso durable de
CU-013, junto con la entrega, en una sola transacción. Ninguna de esas operaciones
modifica Pedidos, importes, reservas, existencias ni el libro financiero.

Misma operación/petición/actor: devuelve su resultado inmutable, incluso si se
perdió la respuesta. Otra clave para el mismo pedido: rechazo explícito de entrega
anterior. Restricciones y bloqueo del pedido impiden dos entregas simultáneas.
La cuenta/vínculo deben seguir autorizados para consultar el replay. Invalidar
es rechazar el uso del QR por la entrega persistida; no se borra su referencia
en Pedidos ni se rompe el replay del pago. El cliente recibe fecha/aviso y deja
de presentar ese QR como utilizable. No hay autorización local/offline ni
promesa de entrega exactamente una vez mediante RabbitMQ.

## Interfaces, cámara y alternativos

Personal: escanear o ingresar el código completo → prevalidación real → revisar
pedido y punto → confirmar explícitamente. Se conserva UUID ante resultado
incierto; no se generan entregas por detecciones repetidas. Se reutiliza
qr_scanner_sheet y mobile_scanner 7.4.2, permisos Android/iOS y recursos de cámara
acotados a la pantalla y al ciclo activo de la aplicación. La entrada manual no
es un código corto ni una autorización local. Playwright prueba el ingreso manual
por UI; las pruebas de cámara se documentan separadas, con dispositivo si procede.

CU-014 A/B/C/D/E rechaza respectivamente no listo, cancelado, entregado, punto
incorrecto y QR inválido. CU-013 C/D/E/F quedan cubiertos por esas verificaciones;
G usa versión/idempotencia/entrega única, sin confundir pedidos distintos de una
misma persona con duplicados. A conserva reporte/resolución conservadora de
incidencias, sin sustituciones ni cambios financieros automáticos; B conserva
retrasos y avisos. Originar cancelaciones del establecimiento CU-011F y coordinar
F12 siguen pendientes. No se implementan permisos globales CU-028 ni funciones
de parqueaderos de la rama de Samuel.
