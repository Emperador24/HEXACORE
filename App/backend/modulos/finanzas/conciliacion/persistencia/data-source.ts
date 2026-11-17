import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../../compartido/persistencia/esquemas';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { cargarConfiguracion, ConfiguracionConciliacion } from '../comun/config/configuracion';
import { CONEXION_CONCILIACION } from './conexion';
import { EsquemaConciliacion1795000000000 } from './migraciones/1795000000000-EsquemaConciliacion';

cargarEnv();

export const ENTIDADES: never[] = [];
export const MIGRACIONES = [EsquemaConciliacion1795000000000];

export function opcionesDataSource(config: ConfiguracionConciliacion = cargarConfiguracion()): DataSourceOptions & { name: string } {
  return {
    name: CONEXION_CONCILIACION,
    type: 'postgres',
    ...opcionesEsquema('finanzas-conciliacion'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema(MIGRACIONES, 'finanzas-conciliacion'),
    migrationsTableName: 'migraciones',
    synchronize: false,
    migrationsRun: false,
    extra: { ...opcionesSesion('finanzas-conciliacion'), application_name: 'nucleo-finanzas-conciliacion' },
  };
}

export default new DataSource(opcionesDataSource());
