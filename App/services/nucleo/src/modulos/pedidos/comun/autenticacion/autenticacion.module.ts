import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CONFIGURACION, ConfiguracionServicio } from '../../../../comun/config/configuracion';
import { SesionValida } from './sesion-valida.guard';

/** Los módulos con rutas protegidas importan este módulo y aplican SesionValida. */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => ({
        publicKey: config.jwt.clavePublica,
        verifyOptions: { algorithms: ['RS256'], issuer: config.emisorTokens },
      }),
    }),
  ],
  providers: [SesionValida],
  // REDIS ya no se exporta: lo provee RedisModule, que es @Global (ADR-12).
  exports: [SesionValida, JwtModule],
})
export class AutenticacionModule {}
