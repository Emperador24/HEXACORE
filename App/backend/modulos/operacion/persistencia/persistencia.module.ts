import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionOperacionModule } from '../comun/config/config.module';
import { CONFIGURACION_OPERACION, ConfiguracionOperacion } from '../comun/config/configuracion';
import { CONEXION_OPERACION } from './conexion';
import { ENTIDADES, opcionesDataSource } from './data-source';

@Module({
  imports: [
    ConfiguracionOperacionModule,
    TypeOrmModule.forRootAsync({
      name: CONEXION_OPERACION,
      inject: [CONFIGURACION_OPERACION],
      useFactory: (config: ConfiguracionOperacion) => opcionesDataSource(config),
    }),
    TypeOrmModule.forFeature(ENTIDADES, CONEXION_OPERACION),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaOperacionModule {}
