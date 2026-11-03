import { Global, Module } from '@nestjs/common';
import { CONFIGURACION_EVENTOS, cargarConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION_EVENTOS, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION_EVENTOS],
})
export class ConfiguracionEventosModule {}
