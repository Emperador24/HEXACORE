import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../compartido/persistencia/esquemas';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { cargarConfiguracion, ConfiguracionOperacion } from '../comun/config/configuracion';
import { CONEXION_OPERACION } from './conexion';
import { Alerta } from './entidades/alerta.entity';
import { Decision } from './entidades/decision.entity';
import { IngresoMonitoreado } from './entidades/ingreso.entity';
import { PuntoAcceso } from './entidades/punto-acceso.entity';
import { EsquemaOperacionMonitoreo1793900000000 } from './migraciones/1793900000000-EsquemaOperacionMonitoreo';
import { Cu010Evacuacion1794100000000 } from './migraciones/1794100000000-Cu010Evacuacion';

cargarEnv();

export const ENTIDADES = [IngresoMonitoreado, PuntoAcceso, Alerta, Decision];
export const MIGRACIONES = [EsquemaOperacionMonitoreo1793900000000, Cu010Evacuacion1794100000000];

export function opcionesDataSource(config: ConfiguracionOperacion = cargarConfiguracion()): DataSourceOptions & { name: string } {
  return {
    name: CONEXION_OPERACION,
    type: 'postgres',
    ...opcionesEsquema('operacion'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema(MIGRACIONES, 'operacion'),
    migrationsTableName: 'migraciones',
    synchronize: false,
    migrationsRun: false,
    extra: { ...opcionesSesion('operacion'), application_name: 'nucleo-operacion' },
  };
}

export default new DataSource(opcionesDataSource());
