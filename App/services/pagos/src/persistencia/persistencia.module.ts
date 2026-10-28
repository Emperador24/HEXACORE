import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';
import { ENTIDADES, opcionesDataSource } from './data-source';

/** Conexión a PostgreSQL. Una sola base y una sola conexión: la por defecto. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}
