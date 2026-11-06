import { Global, Module } from '@nestjs/common';
import { CONFIGURACION_PARQUEADEROS, cargarConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION_PARQUEADEROS, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION_PARQUEADEROS],
})
export class ConfiguracionParqueaderosModule {}
