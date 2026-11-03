# Alimentos dentro de Núcleo

Fuente única trasladada desde `App/services/alimentos`. Conserva catálogo,
menú, checkout, inventario/reservas, adaptador local de Pagos y confirmación
con QR/evento. No completa preparación/entrega, CRUD faltantes ni F12.

Instalar, compilar, migrar y arrancar desde [el workspace](../../README.md).
Usa la conexión TypeORM `alimentos`, esquema `alimentos` y POSTGRES_BD común.
Se conservan sus dos migraciones, tablas e historial propios. POSTGRES_BD_PEDIDOS
se rechaza. La preparación se ejecuta una vez para los ocho esquemas.
El cliente Redis de inventario conserva sus opciones específicas.
Ver [inventario](inventario/README.md) y [pruebas aisladas](../../test/README.md).
