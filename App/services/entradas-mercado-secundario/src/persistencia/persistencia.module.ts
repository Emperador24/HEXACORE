import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ENTIDADES, opcionesDataSource } from './data-source';

/**
 * Conexión a PostgreSQL (ADR-06) y registro de las entidades del dominio.
 *
 * Reexporta `TypeOrmModule.forFeature(ENTIDADES)` para que los módulos de
 * negocio obtengan sus repositorios importando solo este módulo, sin tener que
 * repetir la lista de entidades en cada uno.
 */
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
