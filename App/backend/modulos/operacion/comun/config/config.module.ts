import { Global, Module } from '@nestjs/common';
import { CONFIGURACION_OPERACION, cargarConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION_OPERACION, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION_OPERACION],
})
export class ConfiguracionOperacionModule {}
