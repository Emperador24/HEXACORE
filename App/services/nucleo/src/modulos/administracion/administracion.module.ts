import { Module } from '@nestjs/common';
import { AdministracionCuentasModule } from './administracion-cuentas/administracion-cuentas.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';
import { SesionesModule } from './sesiones/sesiones.module';

/**
 * Módulo de dominio **Administración** dentro del Núcleo (ADR-12).
 *
 * Cubre CU-027 (cuentas de usuario) y CU-028 (roles y permisos). Es el que el
 * CU-027 llama *"servicio de autenticación centralizado (Auth Service) detrás
 * del API Gateway"*: emite los tokens que el resto de servicios de dominio
 * exigen, y es la única fuente de verdad sobre quién es quién.
 *
 * CU-029 (recintos y zonas), CU-030 (proveedores), CU-031 (pagos) y CU-032
 * (reportes) pertenecen a este mismo dominio y se añadirán como módulos
 * hermanos.
 *
 * Este archivo es la **API pública del módulo**: el `AppModule` del Núcleo
 * importa solo esto, nunca los submódulos de adentro. La regla la va a
 * verificar por herramienta la tarjeta 20 (fronteras de módulo).
 *
 * `SaludController` vive aquí por ahora porque consulta la conexión a RabbitMQ
 * y el servicio de revocaciones de este dominio. Cuando entre el módulo de
 * Pedidos se fusiona con el suyo en un `/salud` único que reporte ambas
 * conexiones, y entonces sí sube a `comun/` (tarjeta 08).
 */
@Module({
  imports: [
    PersistenciaModule,
    NotificacionesModule,
    CuentasModule,
    SesionesModule,
    AdministracionCuentasModule,
  ],
  controllers: [SaludController],
})
export class AdministracionModule {}
