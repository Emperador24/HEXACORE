import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions, EntitySchema } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../config/configuracion';
import { EventoReferencia } from './entidades/evento-referencia.entity';
import { Establecimiento } from './entidades/establecimiento.entity';
import { Producto } from './entidades/producto.entity';
import { Pedido } from './entidades/pedido.entity';
import { DetallePedido } from './entidades/detalle-pedido.entity';
import { TransaccionPedido } from './entidades/transaccion-pedido.entity';

export const ENTIDADES: (Function | EntitySchema)[] = [
  EventoReferencia,
  Establecimiento,
  Producto,
  Pedido,
  DetallePedido,
  TransaccionPedido,
];

export const MIGRACIONES: NonNullable<DataSourceOptions['migrations']> = [];

export function opcionesDataSource(config: ConfiguracionServicio): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: MIGRACIONES,
    migrationsTableName: 'migraciones',

    // El esquema se administra mediante migraciones explícitas.
    synchronize: false,
    migrationsRun: false,

    // Límites del pool y de espera, siguiendo el servicio de Administración.
    extra: {
      max: config.postgres.maxConexiones,
      connectionTimeoutMillis: config.postgres.esperaMaximaMs,
      query_timeout: config.postgres.esperaMaximaMs,
      statement_timeout: config.postgres.esperaMaximaMs,
    },

    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

/** DataSource para la CLI de TypeORM. Dentro de la aplicación la crea Nest. */
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
