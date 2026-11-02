# acceso-qr dentro de Boletería

Proyección de QR, ingresos y outbox; tres migraciones.

Una sola implementación trasladada del paquete anterior. No existe un servidor
independiente ni otro package.json para este componente. Ver [composición,
contratos y limitaciones](../README.md) y las instrucciones de prueba del workspace.

Los guiones históricos de pruebas se conservan con referencias actualizadas;
algunos operan sobre datos de desarrollo y no se ejecutaron en esta entrega.
Para verificar el traslado, usar exclusivamente `npm run test:boleteria` desde
App/backend con su infraestructura de pruebas.
