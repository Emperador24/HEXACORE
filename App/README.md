# App

Estado actual de la migración: [plan](../Documentation/Work/Plan_Arquitectura_Migracion_HEXACORE.md)
y [resultados](../Documentation/Work/ESTADO-MIGRACION.md).

Identidad y Alimentos comparten **un único Núcleo NestJS** en
[backend](backend/README.md), con Node 22.22.3, manifiesto/lockfile comunes y dos
conexiones a sus bases actuales. Las rutas públicas `/api/v1` de cuentas,
sesiones, administración de cuentas y pedidos se conservan mediante el gateway.
El servidor directo de Alimentos en 3007 se retira.

```text
App/
  backend/
    apps/nucleo/
    modulos/identidad/
    modulos/alimentos/
    compartido/
    test/
  services/       ventas, postventa, acceso-qr, catálogo, cola, pagos,
                  notificaciones y eventos-emergencias siguen separados
  gateway/        Nginx/njs, entrada pública :8080
  frontend/       portales Angular y app Flutter, fuera del workspace backend
  infra/          PostgreSQL, Redis, RabbitMQ y proveedores simulados
  shared/         contratos entre TypeScript, Dart y aplicaciones
  PoCs/           evidencia histórica del stack
```

Este es un paso hacia Núcleo, Boletería, Operación y Trabajador. Pagos conserva
su servidor temporal; Personal/Logística no se mueve todavía. Los dominios sin
backend o con pantallas simuladas siguen pendientes. No hay MongoDB desplegado
ni se consolida aquí la información de las bases de desarrollo.

Seguir [las instrucciones del workspace](backend/README.md) para instalar,
migrar y arrancar Núcleo, y [las de pruebas](backend/test/README.md) para la
integración exclusiva sin tocar datos habituales. El Compose de `infra/` usa
`nucleo` en lugar de `autenticacion` y `alimentos`; los demás paquetes mantienen
su instalación/compilación propia y el flujo de [WORKFLOW.md](../WORKFLOW.md).

Los responsables funcionales se conservan: Identidad y Alimentos, Sebastián;
Boletería, Daniel y Samuel; Personal/Logística y Operación, Samuel y Diego según
el reparto de CU; Parqueaderos, Daniel y Samuel. Un traslado no completa casos
pendientes ni transfiere su responsabilidad.
