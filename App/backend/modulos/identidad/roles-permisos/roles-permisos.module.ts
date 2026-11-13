import { Module } from '@nestjs/common';
import { AdministradorRequerido } from '../administracion-cuentas/administrador-requerido.guard';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { PermisosCompartidos } from './permisos-compartidos.service';
import { MisPermisosController, RolesPermisosController } from './roles-permisos.controller';
import { RolesPermisosService } from './roles-permisos.service';

/** Roles propios y matriz de permisos por un administrador — CU-028. */
@Module({
  imports: [PersistenciaModule, SesionesModule],
  controllers: [RolesPermisosController, MisPermisosController],
  providers: [RolesPermisosService, PermisosCompartidos, AdministradorRequerido],
})
export class RolesPermisosModule {}
