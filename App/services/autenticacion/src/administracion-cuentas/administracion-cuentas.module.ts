import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { AdministracionCuentasController } from './administracion-cuentas.controller';
import { AdministracionCuentasService } from './administracion-cuentas.service';
import { AdministradorRequerido } from './administrador-requerido.guard';

/** Administración de cuentas por un administrador — CU-027 y CU-027B. */
@Module({
  imports: [PersistenciaModule, SesionesModule],
  controllers: [AdministracionCuentasController],
  providers: [AdministracionCuentasService, AdministradorRequerido],
})
export class AdministracionCuentasModule {}
