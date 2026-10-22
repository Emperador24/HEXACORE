import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../../../comun/config/configuracion';
import { CONEXION_ADMINISTRACION } from '../../../comun/persistencia/conexiones';
import { ENTIDADES, opcionesDataSource } from './data-source';

/**
 * Conexión a PostgreSQL del módulo de Administración y registro de sus entidades.
 *
 * La conexión va **nombrada** (ADR-12): en un solo proceso, dos `forRoot` sin
 * nombre colisionan —la segunda pisa a la primera— y este módulo acabaría
 * consultando la base del otro. El nombre es también el que hay que dar al
 * inyectar: `@InjectDataSource(CONEXION_ADMINISTRACION)`.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: CONEXION_ADMINISTRACION,
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION_ADMINISTRACION),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}
