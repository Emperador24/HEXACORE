import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { CuentasController } from './cuentas.controller';
import { CuentasService } from './cuentas.service';
import { PerfilController } from './perfil.controller';
import { PerfilService } from './perfil.service';
import { RecuperacionService } from './recuperacion.service';

/** Cuentas de usuario (CU-027) y, más adelante, roles (CU-028). */
@Module({
  imports: [PersistenciaModule, NotificacionesModule, SesionesModule],
  controllers: [CuentasController, PerfilController],
  providers: [CuentasService, RecuperacionService, PerfilService],
  exports: [CuentasService],
})
export class CuentasModule {}
