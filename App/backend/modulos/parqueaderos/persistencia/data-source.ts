import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../compartido/persistencia/esquemas';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { cargarConfiguracion, ConfiguracionParqueaderos } from '../comun/config/configuracion';
import { CONEXION_PARQUEADEROS } from './conexion';
import { EsquemaParqueaderos1794200000000 } from './migraciones/1794200000000-EsquemaParqueaderos';

cargarEnv();

/** Sin entidades: el módulo consulta con SQL explícito, como la evacuación (CU-010). */
export const ENTIDADES = [];
export const MIGRACIONES = [EsquemaParqueaderos1794200000000];

export function opcionesDataSource(config: ConfiguracionParqueaderos = cargarConfiguracion()): DataSourceOptions & { name: string } {
  return {
    name: CONEXION_PARQUEADEROS,
    type: 'postgres',
    ...opcionesEsquema('parqueaderos'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema(MIGRACIONES, 'parqueaderos'),
    migrationsTableName: 'migraciones',
    synchronize: false,
    migrationsRun: false,
    extra: { ...opcionesSesion('parqueaderos'), application_name: 'nucleo-parqueaderos' },
  };
}

export default new DataSource(opcionesDataSource());
