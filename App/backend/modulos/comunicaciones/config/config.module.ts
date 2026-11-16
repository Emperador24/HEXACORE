import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CONFIGURACION, cargarConfiguracion, ConfiguracionServicio } from './configuracion';

/** Configuración propia del consumidor y su listener de salud. */
@Global()
@Module({
  imports: [
    // Carga el .env del servicio. `ignoreEnvFile` en producción: allí las
    // variables las inyecta el orquestador, no un archivo en disco.
    NestConfigModule.forRoot({
      envFilePath: ['.env.trabajador'],
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
