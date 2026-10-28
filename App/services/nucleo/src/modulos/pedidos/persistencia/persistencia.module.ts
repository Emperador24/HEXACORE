import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../../../comun/config/configuracion';
import { CONEXION_PEDIDOS } from '../../../comun/persistencia/conexiones';
import { ENTIDADES, opcionesDataSource } from './data-source';

/**
 * Conexión a PostgreSQL del módulo de Pedidos y registro de sus entidades.
 *
 * La conexión va **nombrada** (ADR-12): en un solo proceso, dos `forRoot` sin
 * nombre colisionan —la segunda pisa a la primera— y este módulo acabaría
 * consultando la base del otro. El nombre es también el que hay que dar al
 * inyectar: `@InjectDataSource(CONEXION_PEDIDOS)`.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: CONEXION_PEDIDOS,
      inject: [CONFIGURACION],
      // El nombre va TAMBIÉN dentro de lo que devuelve la fábrica, no solo
      // arriba. `TypeOrmCoreModule` guarda como `this.options` el resultado de
      // esta fábrica, y su gancho de apagado resuelve con él qué DataSource
      // cerrar. Sin el nombre aquí resuelve al token por defecto —que en el
      // Núcleo no existe— y el apagado lanza `UnknownElementException`
      // después de haber hecho su trabajo, ensuciando el SIGTERM que RNF-15
      // necesita limpio.
      useFactory: (config: ConfiguracionServicio) => ({
        ...opcionesDataSource(config),
        name: CONEXION_PEDIDOS,
      }),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION_PEDIDOS),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}
