import { EsquemaPostventa1790035200000 } from './migraciones/1790035200000-EsquemaPostventa';
import { VersionEvento1794400000002 } from './migraciones/1794400000002-VersionEvento';
import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../../compartido/persistencia/esquemas';
import { CONEXION } from './conexion';
import 'reflect-metadata';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { cargarConfiguracion, ConfiguracionServicio } from '../config/configuracion';
import { EventoReferencia } from './entidades/evento-referencia.entity';
import { PublicacionReventa } from './entidades/publicacion-reventa.entity';
import { TransaccionReventa } from './entidades/transaccion-reventa.entity';

/**
 * Las tres tablas de Postventa.
 *
 * `Entrada` **no está**: es de Ventas desde ADR-14, y la publicación la
 * referencia por valor (`entrada_id`) con una copia de lo que anuncia. Es el
 * precio que el ADR-01 ya advertía al separar las bases: se pierde la llave
 * foránea del motor y la integridad pasa a ser de la aplicación.
 */
export const ENTIDADES = [PublicacionReventa, TransaccionReventa, EventoReferencia];

export function opcionesDataSource(config: ConfiguracionServicio): DataSourceOptions & { name: string } {
  return {
    name: CONEXION,
    type: 'postgres',
    ...opcionesEsquema('entradas-postventa'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema([EsquemaPostventa1790035200000, VersionEvento1794400000002], 'entradas-postventa'),
    migrationsTableName: 'migrations',
    // Nunca `synchronize`: el esquema lo gobiernan las migraciones, también en
    // desarrollo. Una tabla que aparece sola no deja constancia de por qué.
    synchronize: false,
    migrationsRun: false,
    extra: { ...opcionesSesion('entradas-postventa'), application_name: 'boleteria-postventa' },
    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

// Este DataSource permite consultar el historial; la preparación es centralizada.
// La aplicación usa el de PersistenciaModule.
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
