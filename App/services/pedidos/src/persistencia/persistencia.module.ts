import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ENTIDADES, opcionesDataSource } from './data-source';

/** Conexión a PostgreSQL y registro de las entidades del dominio. */
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
