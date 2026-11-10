import { InventarioModule } from '../inventario/inventario.module';
import { PersonalEstablecimientoModule } from '../establecimientos/personal-establecimiento.module';
import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [InventarioModule, PersonalEstablecimientoModule, PersistenciaModule, AutenticacionModule],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
