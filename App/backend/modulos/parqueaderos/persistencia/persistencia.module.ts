import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionParqueaderosModule } from '../comun/config/config.module';
import { CONFIGURACION_PARQUEADEROS, ConfiguracionParqueaderos } from '../comun/config/configuracion';
import { CONEXION_PARQUEADEROS } from './conexion';
import { opcionesDataSource } from './data-source';

@Module({
  imports: [
    ConfiguracionParqueaderosModule,
    TypeOrmModule.forRootAsync({
      name: CONEXION_PARQUEADEROS,
      inject: [CONFIGURACION_PARQUEADEROS],
      useFactory: (config: ConfiguracionParqueaderos) => opcionesDataSource(config),
    }),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaParqueaderosModule {}
