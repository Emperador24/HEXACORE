import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [PersistenciaModule, AutenticacionModule],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
