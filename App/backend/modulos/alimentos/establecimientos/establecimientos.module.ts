import { Module } from '@nestjs/common';
import { ConsultaEventosModule } from '../../eventos-recintos/consulta-eventos.module';
import { ConsultaPersonalModule } from '../../identidad/consulta-personal.module';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { EstablecimientosController, MisEstablecimientosController } from './establecimientos.controller';
import { EstablecimientosService } from './establecimientos.service';

@Module({ imports: [PersistenciaModule, AutenticacionModule, ConsultaEventosModule, ConsultaPersonalModule],
  controllers: [EstablecimientosController, MisEstablecimientosController], providers: [EstablecimientosService] })
export class EstablecimientosModule {}
