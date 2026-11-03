import { Global, Module } from '@nestjs/common';
import { ConfigModule as EntornoModule } from '@nestjs/config';
import { CONFIGURACION_PROCESO, cargarConfiguracionProceso } from './configuracion';

@Global()
@Module({
  imports: [EntornoModule.forRoot({ ignoreEnvFile: process.env.NODE_ENV === 'production', cache: true })],
  providers: [{ provide: CONFIGURACION_PROCESO, useFactory: cargarConfiguracionProceso }],
  exports: [CONFIGURACION_PROCESO],
})
export class ConfiguracionProcesoModule {}
