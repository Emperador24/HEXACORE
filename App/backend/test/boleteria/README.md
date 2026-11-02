# Referencia aislada de Boletería, antes del traslado

Base: 125fe36d874efc0f30d268a3219635854b807b82. Node **22.22.3**
(`cd App/backend && nvm install && nvm use`); Docker y Compose. Las cinco
aplicaciones conservan sus dependencias y reglas. Instalar con npm ci en cada
paquete y App/backend si faltan sus node_modules. Ninguna semilla es necesaria.

Desde raíz, con esa versión de Node en PATH:

```bash
npm --prefix App/backend run test:boleteria:infra
npm --prefix App/backend run test:boleteria:referencia
# Repetir sobre los mismos datos, sin recompilar artefactos ya comprobados:
node App/backend/test/boleteria/correr-referencia.cjs
# Tipos y pruebas existentes; Cola exige el Redis propio, sin retornos silenciosos:
node App/backend/test/boleteria/comprobar-actuales.cjs
# Observación F13 opcional en otra terminal:
python3 App/backend/test/boleteria/observar-recursos.py --segundos 120
# Solo al terminar; retira exclusivamente contenedores/red/volúmenes del proyecto:
npm --prefix App/backend run test:boleteria:limpiar
```

Proyecto **hexacore-boleteria-e2e**, sin nombres/volúmenes/redes externos.
PostgreSQL 15436 (boleteria_e2e), Redis 16383, RabbitMQ 15676/16776 vhost boleteria,
Pagos 13090 y pasarela 13102, todos en loopback. Los procesos actuales usan
13091 Ventas, 13092 Catálogo, 13093 Cola, 13094 Postventa y 13095 Acceso QR.
Bases exclusivas: entradas_e2e, catalogo_boleteria_e2e, postventa_boleteria_e2e,
acceso_qr_boleteria_e2e y pagos_boleteria_e2e. Cuatro historiales de negocio:
5+1+1+3 migraciones; Postventa conserva el nombre histórico **migrations**.
`synchronize=false`; Pagos aplica su migración a su propio libro.

`procesos.cjs` impone destinos y Node, aplica las migraciones compiladas y
levanta cinco procesos reales; al terminar envía SIGTERM y guarda logs en
`.evidencia-e2e/` (ignorada por Git). Cierre forzado o errores de cierre fallan.
Los JWT usan las claves fixture de test/claves; esta suite no prueba login,
gateway, Angular/Flutter ni un proveedor financiero real.

Se ejecutan los ocho casos originales de Ventas y doce escenarios HTTP/SQL:
cartelera, turno de un solo uso, compra/promoción/rechazo/aprobación/repetición,
outbox y proyección, cancelación con reembolso real, reservas concurrentes,
checkout de reventa concurrente, transferencia/historial/rotación de QR,
rechazo de QR anterior y doble ingreso, cron real de vencimiento y revocación.
El cron de prueba se configura a un segundo mediante la opción existente;
no se amplían timeouts. Los fixtures usan UUID nuevos y no se truncan tablas ni
se purgan colas. Los historiales inmutables se conservan hasta limpiar el proyecto.

La espera de QR se identifica expresamente como **convergencia de proyección**:
se lee su estado inmediatamente después de transferir y se registra cuánto tarda.
Rechazar el QR antiguo tras converger no demuestra invalidación inmediata.
Ingreso→Ventas también sigue siendo eventual; no hay atomicidad entre bases.
Liquidación al vendedor y notificación de Postventa registran lo que se enviaría;
no acreditan abono ni recepción real. F12/F13/F14 permanecen pendientes.

Los guiones Python históricos se conservan, pero varios fijan contenedores de
desarrollo, ejecutan semillas o truncan. No se usan para esta referencia aislada.
