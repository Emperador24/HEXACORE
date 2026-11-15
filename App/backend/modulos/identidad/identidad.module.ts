import { ConfigModule } from './comun/config/config.module';
import { Module } from '@nestjs/common';
import { AdministracionCuentasModule } from './administracion-cuentas/administracion-cuentas.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { RolesPermisosModule } from './roles-permisos/roles-permisos.module';
import { SesionesModule } from './sesiones/sesiones.module';

/** API pública de identidad en Núcleo. Conserva su base y sus reglas actuales. */
@Module({
  imports: [
    ConfigModule,
    PersistenciaModule,
    NotificacionesModule,
    CuentasModule,
    SesionesModule,
    AdministracionCuentasModule,
    RolesPermisosModule,
  ],
})
export class IdentidadModule {}
