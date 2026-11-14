import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventosRecintosModule } from '../eventos-recintos/eventos-recintos.module';
import { PagosModule } from '../finanzas/pagos';
import { AccesosService } from './accesos/accesos.service';
import { AsignacionService } from './asignacion/asignacion.service';
import { CobroService } from './cobro/cobro.service';
import { SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { CONFIGURACION_PARQUEADEROS, ConfiguracionParqueaderos } from './comun/config/configuracion';
import { OcupacionService } from './ocupacion/ocupacion.service';
import { FlujoOcupacionService } from './ocupacion/flujo-ocupacion.service';
import { ParqueaderosController } from './parqueaderos.controller';
import { PersistenciaParqueaderosModule } from './persistencia/persistencia.module';
import { NotificadorReservas } from './reservas/notificador-reservas.service';
import { ReservasController } from './reservas/reservas.controller';
import { ReservasService } from './reservas/reservas.service';

/**
 * Parqueaderos: reserva (CU-021), ingreso y salida (CU-022), asignación de
 * espacios (CU-023), cobro (CU-024) y control de ocupación (CU-025), dentro
 * del Núcleo con esquema propio. Lee el evento por la interfaz local de
 * eventos-recintos, cobra las reservas por Finanzas/Pagos y expone el resumen
 * de ocupación al monitoreo (CU-019).
 */
@Module({
  imports: [
    PersistenciaParqueaderosModule,
    EventosRecintosModule,
    PagosModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_PARQUEADEROS],
      useFactory: (config: ConfiguracionParqueaderos) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [ParqueaderosController, ReservasController],
  providers: [SesionValida, CobroService, OcupacionService, FlujoOcupacionService, AsignacionService, AccesosService, ReservasService, NotificadorReservas],
  exports: [OcupacionService],
})
export class ParqueaderosModule {}
