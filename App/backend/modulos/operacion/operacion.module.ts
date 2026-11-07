import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventosRecintosModule } from '../eventos-recintos/eventos-recintos.module';
import { ParqueaderosModule } from '../parqueaderos/parqueaderos.module';
import { PersonalLogisticaModule } from '../personal-logistica/personal-logistica.module';
import { SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { CONFIGURACION_OPERACION, ConfiguracionOperacion } from './comun/config/configuracion';
import { EvacuacionController } from './evacuacion/evacuacion.controller';
import { EvacuacionService } from './evacuacion/evacuacion.service';
import { NotificadorEvacuacion } from './evacuacion/notificador-evacuacion.service';
import { ConsumidorIngresosMonitoreo } from './monitoreo/consumidor-ingresos.service';
import { MonitoreoController } from './monitoreo/monitoreo.controller';
import { PanelService } from './monitoreo/panel.service';
import { PersistenciaOperacionModule } from './persistencia/persistencia.module';

/**
 * Operación (ADR-16): el monitoreo del evento (CU-019) y la evacuación ante
 * emergencias (CU-010). Vive dentro del
 * Núcleo hasta que exista el programa Operación; sus dependencias con otros
 * módulos son interfaces locales de solo lectura (eventos y cobertura de
 * personal) y una cola propia en RabbitMQ, así que moverlo es cambiar dónde
 * se registra este módulo.
 */
@Module({
  imports: [
    PersistenciaOperacionModule,
    EventosRecintosModule,
    PersonalLogisticaModule,
    ParqueaderosModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_OPERACION],
      useFactory: (config: ConfiguracionOperacion) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [MonitoreoController, EvacuacionController],
  providers: [SesionValida, PanelService, ConsumidorIngresosMonitoreo, EvacuacionService, NotificadorEvacuacion],
})
export class OperacionModule {}
