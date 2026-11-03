import { Module } from '@nestjs/common';
import { ColaController } from './cola.controller';
import { ColaService } from './cola.service';
import { TurnosInternosController } from './turnos-internos.controller';

@Module({
  imports: [],
  controllers: [ColaController, TurnosInternosController],
  providers: [ColaService],
})
export class ColaModule {}
