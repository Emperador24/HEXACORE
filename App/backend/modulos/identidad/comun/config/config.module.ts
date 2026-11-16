import { Global, Module } from '@nestjs/common';
import { CONFIGURACION, cargarConfiguracion } from './configuracion';

/** Configuración exclusiva del módulo: no comparte token con otros dominios. */
@Global()
@Module({ providers: [{ provide: CONFIGURACION, useFactory: cargarConfiguracion }], exports: [CONFIGURACION] })
export class ConfigModule {}
