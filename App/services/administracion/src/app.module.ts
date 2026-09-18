import { Module } from '@nestjs/common';
import { AdministracionCuentasModule } from './administracion-cuentas/administracion-cuentas.module';
import { ConfigModule } from './config/config.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';
import { SesionesModule } from './sesiones/sesiones.module';

/**
 * Servicio de Administración.
 *
 * Cubre CU-027 (cuentas de usuario) y CU-028 (roles y permisos). Es el que el
 * CU-027 llama *"servicio de autenticación centralizado (Auth Service) detrás
 * del API Gateway"*: emite los tokens que el resto de microservicios exigen, y
 * es la única fuente de verdad sobre quién es quién.
 *
 * CU-029 (recintos y zonas), CU-030 (proveedores), CU-031 (pagos) y CU-032
 * (reportes) pertenecen a este mismo dominio y se añadirán como módulos
 * hermanos.
 */
@Module({
  imports: [ConfigModule, PersistenciaModule, NotificacionesModule, CuentasModule, SesionesModule, AdministracionCuentasModule],
  controllers: [SaludController],
})
export class AppModule {}
