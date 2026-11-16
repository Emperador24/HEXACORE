# App

Estado actual de la migración: [plan](../Documentation/Work/Plan_Arquitectura_Migracion_HEXACORE.md)
y [resultados](../Documentation/Work/ESTADO-MIGRACION.md).

Identidad, Alimentos y Personal/Logística comparten **un único Núcleo NestJS** en
[backend](backend/README.md), con Node 22.22.3, manifiesto/lockfile comunes y tres
conexiones de negocio a sus esquemas, más la financiera compartida. Las rutas públicas `/api/v1` de cuentas,
sesiones, administración de cuentas, pedidos y logística se conservan mediante el gateway.
Boletería reúne las cinco implementaciones de Entradas en otro proceso :3001,
con cuatro esquemas y diez migraciones conservadas. Se retiran los servidores
directos anteriores. Ambos usan el módulo Pagos y el mismo libro; solo Núcleo recibe el webhook. Las rutas de web/móvil en el gateway permanecen iguales.

```text
App/
  backend/
    apps/nucleo/
    apps/boleteria/
    apps/trabajador/
    modulos/comunicaciones/
    modulos/identidad/
    modulos/alimentos/
    modulos/personal-logistica/
    modulos/eventos-recintos/   CU-026 y CU-029, dueño único del Evento
    modulos/operacion/          CU-019 y CU-010, futuro programa Operación
    modulos/parqueaderos/       CU-021 a CU-025
    modulos/entradas/
    modulos/finanzas/pagos/
    compartido/
    test/
  services/       sin backends activos; Pedidos local se preserva
  gateway/        Nginx/njs, entrada pública :8080
  frontend/       portales Angular y app Flutter, fuera del workspace backend
  infra/          PostgreSQL, Redis, RabbitMQ y proveedores simulados
  shared/         contratos entre TypeScript, Dart y aplicaciones
  PoCs/           evidencia histórica del stack
```

Este es un paso hacia Núcleo, Boletería, Operación y Trabajador. Pagos es reutilizable sin servidor; Personal/Logística ya pertenece al Núcleo; Operación existe como módulo del Núcleo (monitoreo CU-019 y evacuación CU-010) y aún no como programa aparte; Trabajador ejecuta solo el correo ya implementado. Los dominios sin
backend o con pantallas simuladas siguen pendientes. No hay MongoDB desplegado
ni se modifican aquí las bases habituales. La configuración activa usa una sola
base que actualmente tiene once esquemas (ocho de la consolidación y tres posteriores), comprobada sobre instalaciones aisladas;
el corte del entorno habitual sigue pendiente.

Seguir [las instrucciones del workspace](backend/README.md) para instalar,
migrar y arrancar Núcleo/Boletería y el [Trabajador](backend/modulos/comunicaciones/README.md). Integración exclusiva: [Núcleo](backend/test/README.md)
y [Boletería](backend/test/boleteria/README.md), sin datos habituales. Compose
ejecuta Núcleo, Boletería y Trabajador, más una tarea única de migración
de los once historiales (29 migraciones, 18 procedencias históricas conservadas). Todo backend activo comparte manifiesto/lockfile en App/backend. Se mantiene el flujo de [WORKFLOW.md](../WORKFLOW.md).

Los responsables funcionales se conservan: Identidad y Alimentos, Sebastián;
Boletería, Daniel y Samuel; Personal/Logística y Operación, Samuel y Diego según
el reparto de CU; Parqueaderos, Daniel y Samuel. Un traslado no completa casos
pendientes ni transfiere su responsabilidad.
