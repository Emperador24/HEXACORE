import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CONFIGURACION, ConfiguracionServicio } from '../../../../comun/config/configuracion';
import { REDIS } from '../../../../comun/redis/redis.module';
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
  exports: [SesionValida, JwtModule, REDIS],
})
export class AutenticacionModule {}
