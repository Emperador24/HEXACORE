import { CONEXION } from './conexion';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ENTIDADES, opcionesDataSource } from './data-source';

/**
 * Conexión a PostgreSQL (ADR-06) y registro de las entidades del dominio.
 *
 * Reexporta `TypeOrmModule.forFeature(ENTIDADES, CONEXION)` para que los módulos de
 * negocio obtengan sus repositorios importando solo este módulo, sin tener que
 * repetir la lista de entidades en cada uno.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: CONEXION,
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}
