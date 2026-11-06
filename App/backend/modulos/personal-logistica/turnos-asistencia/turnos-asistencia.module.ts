import { Module } from '@nestjs/common';
import { CONFIGURACION_LOGISTICA, ConfiguracionLogistica } from '../comun/config/configuracion';
import { PersistenciaLogisticaModule } from '../persistencia/persistencia.module';
import { JwtModule } from '@nestjs/jwt';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { AsistenciaController } from './asistencia.controller';
import {
  ContextoDeLogistica,
  SoloQuienSupervisa,
} from './autorizacion.guard';
import { AsistenciaService } from './asistencia.service';
import { CoberturaPersonalService } from './cobertura-personal.service';
import { EventosConsumidorService } from './eventos-consumidor.service';
import { EventosPublicadorService } from './eventos-publicador.service';
import { GestionPersonalController } from './gestion-personal.controller';
import { GestionPersonalService } from './gestion-personal.service';
import { NotificacionesController } from './notificaciones.controller';
import { PersonalOperativoController } from './personal-operativo.controller';
import { PersonalOperativoService } from './personal-operativo.service';
import { TurnosController } from './turnos.controller';
import { TurnosService } from './turnos.service';

@Module({
  imports: [
    PersistenciaLogisticaModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_LOGISTICA],
      useFactory: (config: ConfiguracionLogistica) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [
    TurnosController,
    AsistenciaController,
    NotificacionesController,
    PersonalOperativoController,
    // Tras TurnosController: `empleados/yo` antes que `empleados/:id`.
    GestionPersonalController,
  ],
  providers: [
    SesionValida,
    // Guardias de logística: `ContextoDeLogistica` necesita el repositorio de
    // empleados, así que tiene que estar declarado aquí para que Nest se lo
    // inyecte.
    ContextoDeLogistica,
    SoloQuienSupervisa,
    TurnosService,
    AsistenciaService,
    PersonalOperativoService,
    GestionPersonalService,
    CoberturaPersonalService,
    EventosPublicadorService,
    EventosConsumidorService,
  ],
  // Lectura de cobertura para el monitoreo (CU-019); el resto queda interno.
  exports: [CoberturaPersonalService],
})
export class TurnosAsistenciaModule {}
