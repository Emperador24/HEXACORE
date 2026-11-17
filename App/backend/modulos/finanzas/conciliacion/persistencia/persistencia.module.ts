import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionConciliacionModule } from '../comun/config/config.module';
import { CONFIGURACION_CONCILIACION, ConfiguracionConciliacion } from '../comun/config/configuracion';
import { CONEXION_CONCILIACION } from './conexion';
import { opcionesDataSource } from './data-source';

@Module({
  imports: [
    ConfiguracionConciliacionModule,
    TypeOrmModule.forRootAsync({
      name: CONEXION_CONCILIACION,
      inject: [CONFIGURACION_CONCILIACION],
      useFactory: (config: ConfiguracionConciliacion) => opcionesDataSource(config),
    }),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaConciliacionModule {}
