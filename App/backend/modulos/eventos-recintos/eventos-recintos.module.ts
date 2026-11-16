import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { CONFIGURACION_EVENTOS, ConfiguracionEventos } from './comun/config/configuracion';
import { BandejaEventos } from './eventos/bandeja-eventos.service';
import { EventosController } from './eventos/eventos.controller';
import { EventosService } from './eventos/eventos.service';
import { RecintosController } from './recintos/recintos.controller';
import { RecintosService } from './recintos/recintos.service';
import { PersistenciaEventosModule } from './persistencia/persistencia.module';

/** CU-026 (Gestión de eventos) y CU-029 (Gestión de recintos y zonas), dentro del Núcleo. */
@Module({
  imports: [
    PersistenciaEventosModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_EVENTOS],
      useFactory: (config: ConfiguracionEventos) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [EventosController, RecintosController],
  providers: [SesionValida, EventosService, BandejaEventos, RecintosService],
  // Lectura de eventos y recintos para Operación (CU-019, CU-010), por interfaz local.
  exports: [EventosService, RecintosService],
})
export class EventosRecintosModule {}
