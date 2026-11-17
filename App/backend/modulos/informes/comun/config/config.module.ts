import { Global, Module } from '@nestjs/common';
import { CONFIGURACION_INFORMES, cargarConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION_INFORMES, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION_INFORMES],
})
export class ConfiguracionInformesModule {}
