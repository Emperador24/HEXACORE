import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../comun/config/configuracion';
import { TransaccionPago } from './entidades/transaccion-pago.entity';
import { EsquemaPagos1790380800000 } from './migraciones/1790380800000-EsquemaPagos';

export const ENTIDADES = [TransaccionPago];
export const MIGRACIONES = [EsquemaPagos1790380800000];

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
    extra: {
      max: config.postgres.maxConexiones,
      connectionTimeoutMillis: config.postgres.esperaMaximaMs,
    },

    // Nunca `synchronize: true`: las restricciones CHECK que impiden un
    // APROBADO sin referencia no se deducen de la entidad.
    synchronize: false,
    migrationsRun: false,
    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
