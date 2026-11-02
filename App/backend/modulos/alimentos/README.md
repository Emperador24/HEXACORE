# Alimentos dentro de Núcleo

Fuente única trasladada desde `App/services/alimentos`. Conserva catálogo,
menú, checkout, inventario/reservas, cliente HTTP del Pagos temporal y confirmación
con QR/evento. No completa preparación/entrega, CRUD faltantes ni F12.

Instalar, compilar, migrar y arrancar desde [el workspace](../../README.md).
Usa la conexión TypeORM `alimentos` y `POSTGRES_BD_PEDIDOS` (pedidos por defecto).
Se conservan sus dos migraciones, tablas e historial separados de Identidad.
El cliente Redis de inventario conserva sus opciones específicas.
Ver [inventario](inventario/README.md) y [pruebas aisladas](../../test/README.md).
