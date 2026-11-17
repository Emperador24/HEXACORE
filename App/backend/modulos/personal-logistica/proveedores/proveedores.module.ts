import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventosRecintosModule } from '../../eventos-recintos/eventos-recintos.module';
import { CONFIGURACION_LOGISTICA, ConfiguracionLogistica } from '../comun/config/configuracion';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { PersistenciaLogisticaModule } from '../persistencia/persistencia.module';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';

/** CU-030: Gestión de Proveedores. */
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
  controllers: [ProveedoresController],
  providers: [SesionValida, ProveedoresService],
})
export class ProveedoresModule {}
