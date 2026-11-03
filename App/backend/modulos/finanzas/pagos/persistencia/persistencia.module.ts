import { CONEXION_PAGOS } from './conexion';
import { ConfigPagosModule } from '../config/config.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ENTIDADES, opcionesDataSource } from './data-source';

/** Conexión a PostgreSQL. Libro único y conexión nombrada del módulo. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: CONEXION_PAGOS,
      imports: [ConfigPagosModule],
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION_PAGOS),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}
