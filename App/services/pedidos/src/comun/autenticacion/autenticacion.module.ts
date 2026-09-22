import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import Redis from 'ioredis';
import { ConfigModule } from '../../config/config.module';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import { proveedorRedis, REDIS } from './redis.provider';
import { SesionValida } from './sesion-valida.guard';

/** Los módulos con rutas protegidas importan este módulo y aplican SesionValida. */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => ({
        publicKey: config.autenticacion.clavePublica.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: config.autenticacion.emisor },
      }),
    }),
  ],
  providers: [proveedorRedis, SesionValida],
  exports: [SesionValida, JwtModule, REDIS],
})
export class AutenticacionModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
