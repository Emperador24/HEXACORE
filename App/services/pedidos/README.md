# Servicio de Pedidos

CU-011–CU-015.

**Responsabilidad:** pedido de alimentos durante el evento, administración de menú/inventario,
preparación y entrega validada por QR, y gestión de los establecimientos.

**Entidades del dominio (SAD §12):** Pedido, Establecimiento, Producto.

**Responsable:** Sebastián Sánchez.

**Estado:** pendiente de implementación (Entrega 2). No está aún detallado como contenedor propio en
la vista de componentes del SAD v1.1; se separa de `administracion` porque tiene un flujo y un
responsable claramente distintos (pedido → preparación → entrega por QR).
