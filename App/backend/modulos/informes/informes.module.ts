import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventosRecintosModule } from '../eventos-recintos/eventos-recintos.module';
import { OperacionModule } from '../operacion/operacion.module';
import { ParqueaderosModule } from '../parqueaderos/parqueaderos.module';
import { PersonalLogisticaModule } from '../personal-logistica/personal-logistica.module';
import { ConfiguracionInformesModule } from './comun/config/config.module';
import { CONFIGURACION_INFORMES, ConfiguracionInformes } from './comun/config/configuracion';
import { SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { InformesController } from './informes.controller';
import { InformesService } from './informes.service';

/**
 * CU-032: Gestión de Reportes y Analítica del Evento. Sin esquema ni
 * conexión propia (ADR-16): agrega, por interfaz local de solo lectura, lo
 * que Eventos, Parqueaderos, Personal/Logística y Operación ya calculan.
 */
@Module({
  imports: [
    ConfiguracionInformesModule,
    EventosRecintosModule,
    ParqueaderosModule,
    PersonalLogisticaModule,
    OperacionModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION_INFORMES],
      useFactory: (config: ConfiguracionInformes) => ({
        publicKey: config.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  controllers: [InformesController],
  providers: [SesionValida, InformesService],
})
export class InformesModule {}
