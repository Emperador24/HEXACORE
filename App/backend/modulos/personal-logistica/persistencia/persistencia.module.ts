import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionLogisticaModule } from '../comun/config/config.module';
import { CONFIGURACION_LOGISTICA, ConfiguracionLogistica } from '../comun/config/configuracion';
import { CONEXION_LOGISTICA } from './conexion';
import { ENTIDADES, opcionesDataSource } from './data-source';

@Module({
  imports: [
    ConfiguracionLogisticaModule,
    TypeOrmModule.forRootAsync({
      name: CONEXION_LOGISTICA,
      inject: [CONFIGURACION_LOGISTICA],
      // Incluye el mismo nombre dentro de las opciones para cerrar el token correcto.
      useFactory: (config: ConfiguracionLogistica) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION_LOGISTICA),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaLogisticaModule {}
