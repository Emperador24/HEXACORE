import { Module } from '@nestjs/common';
import { CONFIGURACION, cargarConfiguracion } from './configuracion';

@Module({
  providers: [{ provide: CONFIGURACION, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION],
})
export class ConfigPagosModule {}
