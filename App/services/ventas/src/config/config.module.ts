import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CONFIGURACION, cargarConfiguracion, ConfiguracionServicio } from './configuracion';

/**
 * Expone la configuración ya validada a todo el servicio.
 *
 * Es `@Global` porque casi todos los componentes del SAD §9 necesitan algún
 * dato de aquí (el Gestor de Concurrencia el TTL, el Procesador de Pagos la
 * URL de la pasarela, el Servicio de Publicación las reglas de precio), y
 * repetir el import en cada módulo no aporta nada.
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
