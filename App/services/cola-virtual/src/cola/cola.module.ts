import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { ColaController } from './cola.controller';
import { ColaService } from './cola.service';
import { TurnosInternosController } from './turnos-internos.controller';

@Module({
  imports: [AutenticacionModule],
  controllers: [ColaController, TurnosInternosController],
  providers: [ColaService],
})
export class ColaModule {}
