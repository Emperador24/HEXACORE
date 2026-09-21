import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CONFIGURACION, cargarConfiguracion, ConfiguracionServicio } from './configuracion';

/** Expone la configuración validada a los módulos del servicio. */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: ['.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      cache: true,
    }),
  ],
  providers: [
    {
      provide: CONFIGURACION,
      useFactory: (): ConfiguracionServicio => cargarConfiguracion(),
    },
  ],
  exports: [CONFIGURACION],
})
export class ConfigModule {}
