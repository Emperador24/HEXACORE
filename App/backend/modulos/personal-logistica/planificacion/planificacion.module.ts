import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventosRecintosModule } from '../../eventos-recintos/eventos-recintos.module';
import { CONFIGURACION_LOGISTICA, ConfiguracionLogistica } from '../comun/config/configuracion';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { PersistenciaLogisticaModule } from '../persistencia/persistencia.module';
import { PlanificacionController } from './planificacion.controller';
import { PlanificacionService } from './planificacion.service';

/** CU-016: Planificar logística del evento. */
@Module({
  imports: [
    PersistenciaLogisticaModule,
    EventosRecintosModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_LOGISTICA],
      useFactory: (config: ConfiguracionLogistica) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [PlanificacionController],
  providers: [SesionValida, PlanificacionService],
})
export class PlanificacionModule {}
