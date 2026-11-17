import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PagosModule } from '../pagos';
import { CONFIGURACION_CONCILIACION, ConfiguracionConciliacion } from './comun/config/configuracion';
import { SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { ConciliacionController } from './conciliacion.controller';
import { ConciliacionService } from './conciliacion.service';
import { ConciliadorService } from './conciliador.service';
import { JobPeriodicoConciliacion } from './job-periodico.service';
import { PersistenciaConciliacionModule } from './persistencia/persistencia.module';

/**
 * CU-031: Gestión de Pagos y Conciliación Financiera. Vive en el Núcleo hasta
 * que exista un programa propio de Finanzas; su dependencia con Pagos es la
 * API pública de `PagosModule` (`PagosService`), nunca sus entidades internas.
 */
@Module({
  imports: [
    PersistenciaConciliacionModule,
    PagosModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_CONCILIACION],
      useFactory: (config: ConfiguracionConciliacion) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [ConciliacionController],
  providers: [SesionValida, ConciliacionService, ConciliadorService, JobPeriodicoConciliacion],
})
export class ConciliacionModule {}
