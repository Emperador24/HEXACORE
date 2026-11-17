import { Global, Module } from '@nestjs/common';
import { CONFIGURACION_CONCILIACION, cargarConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION_CONCILIACION, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION_CONCILIACION],
})
export class ConfiguracionConciliacionModule {}
