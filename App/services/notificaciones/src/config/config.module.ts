import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CONFIGURACION, cargarConfiguracion, ConfiguracionServicio } from './configuracion';

/**
 * Expone la configuración ya validada a todo el servicio.
 *
 * Es `@Global` porque casi todo lo que hay aquí necesita algún dato suyo: el
 * servicio de cuentas la política de contraseñas, el de sesiones el secreto de
 * firma y la expiración, el de bloqueo los umbrales de CU-027D.
 */
@Global()
@Module({
  imports: [
    // Carga el .env del servicio. `ignoreEnvFile` en producción: allí las
    // variables las inyecta el orquestador, no un archivo en disco.
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
