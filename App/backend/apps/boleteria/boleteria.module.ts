import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InfraBoleteriaModule } from '../../modulos/entradas/compartido/infra.module';
import { EntradasModule } from '../../modulos/entradas/entradas.module';
import { SaludBoleteriaController } from './salud.controller';
@Module({
  imports: [InfraBoleteriaModule, ScheduleModule.forRoot(), EntradasModule],
  controllers: [SaludBoleteriaController],
})
export class BoleteriaModule {}
