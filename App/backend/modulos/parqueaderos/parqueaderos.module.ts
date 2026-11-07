import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventosRecintosModule } from '../eventos-recintos/eventos-recintos.module';
import { CobroService } from './cobro/cobro.service';
import { SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { CONFIGURACION_PARQUEADEROS, ConfiguracionParqueaderos } from './comun/config/configuracion';
import { OcupacionService } from './ocupacion/ocupacion.service';
import { ParqueaderosController } from './parqueaderos.controller';
import { PersistenciaParqueaderosModule } from './persistencia/persistencia.module';

/**
 * Parqueaderos: cobro (CU-024) y control de ocupación (CU-025), dentro del
 * Núcleo con esquema propio. Lee el evento por la interfaz local de
 * eventos-recintos y expone el resumen de ocupación al monitoreo (CU-019).
 * La reserva y la lectura de su QR (CU-021-023) quedan para su responsable.
 */
@Module({
  imports: [
    PersistenciaParqueaderosModule,
    EventosRecintosModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_PARQUEADEROS],
      useFactory: (config: ConfiguracionParqueaderos) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [ParqueaderosController],
  providers: [SesionValida, CobroService, OcupacionService],
  exports: [OcupacionService],
})
export class ParqueaderosModule {}
