# App

Estado actual de la migración: [plan](../Documentation/Work/Plan_Arquitectura_Migracion_HEXACORE.md)
y [resultados](../Documentation/Work/ESTADO-MIGRACION.md).

Identidad, Alimentos y Personal/Logística comparten **un único Núcleo NestJS** en
[backend](backend/README.md), con Node 22.22.3, manifiesto/lockfile comunes y tres
conexiones a sus bases actuales. Las rutas públicas `/api/v1` de cuentas,
sesiones, administración de cuentas, pedidos y logística se conservan mediante el gateway.
Boletería reúne las cinco implementaciones de Entradas en otro proceso :3001,
con cuatro bases y diez migraciones conservadas. Se retiran los servidores
directos anteriores; Pagos conserva su interfaz HTTP desde el workspace. Las rutas de web/móvil en el gateway permanecen iguales.

```text
App/
  backend/
    apps/nucleo/
    apps/boleteria/
    apps/pagos-http/      # envoltura temporal; mismo servidor, no otro adicional
    modulos/identidad/
    modulos/alimentos/
    modulos/personal-logistica/
    modulos/entradas/
    modulos/finanzas/pagos/
    compartido/
    test/
  services/       notificaciones sigue fuera del workspace; Pedidos local se preserva
  gateway/        Nginx/njs, entrada pública :8080
  frontend/       portales Angular y app Flutter, fuera del workspace backend
  infra/          PostgreSQL, Redis, RabbitMQ y proveedores simulados
  shared/         contratos entre TypeScript, Dart y aplicaciones
  PoCs/           evidencia histórica del stack
```

Este es un paso hacia Núcleo, Boletería, Operación y Trabajador. Pagos conserva
su servidor temporal; Personal/Logística ya pertenece al Núcleo; Operación sigue pendiente. Los dominios sin
backend o con pantallas simuladas siguen pendientes. No hay MongoDB desplegado
ni se consolida aquí la información de las bases de desarrollo.

Seguir [las instrucciones del workspace](backend/README.md) para instalar,
migrar y arrancar Núcleo/Boletería. Integración exclusiva: [Núcleo](backend/test/README.md)
y [Boletería](backend/test/boleteria/README.md), sin datos habituales. Compose
ejecuta esos programas, Pagos y Notificaciones; los dos últimos mantienen su
instalación propia y el flujo de [WORKFLOW.md](../WORKFLOW.md).

Los responsables funcionales se conservan: Identidad y Alimentos, Sebastián;
Boletería, Daniel y Samuel; Personal/Logística y Operación, Samuel y Diego según
el reparto de CU; Parqueaderos, Daniel y Samuel. Un traslado no completa casos
pendientes ni transfiere su responsabilidad.
