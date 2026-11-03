import { Global, Module } from '@nestjs/common';
import { CONFIGURACION_LOGISTICA, cargarConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION_LOGISTICA, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION_LOGISTICA],
})
export class ConfiguracionLogisticaModule {}
