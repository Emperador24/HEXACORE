import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionEventosModule } from '../comun/config/config.module';
import { CONFIGURACION_EVENTOS, ConfiguracionEventos } from '../comun/config/configuracion';
import { CONEXION_EVENTOS } from './conexion';
import { ENTIDADES, opcionesDataSource } from './data-source';

@Module({
  imports: [
    ConfiguracionEventosModule,
    TypeOrmModule.forRootAsync({
      name: CONEXION_EVENTOS,
      inject: [CONFIGURACION_EVENTOS],
      useFactory: (config: ConfiguracionEventos) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION_EVENTOS),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaEventosModule {}
