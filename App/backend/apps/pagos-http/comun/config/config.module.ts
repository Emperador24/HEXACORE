import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CONFIGURACION, cargarConfiguracion } from './configuracion';

/** Solo pertenece al proceso HTTP temporal, nunca al módulo financiero. */
@Global()
@Module({
  imports: [NestConfigModule.forRoot({ ignoreEnvFile: process.env.NODE_ENV === 'production', cache: true })],
  providers: [{ provide: CONFIGURACION, useFactory: cargarConfiguracion }],
  exports: [CONFIGURACION],
})
export class ConfigHttpModule {}
