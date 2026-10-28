import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../config/configuracion';
import { EventoReferencia } from './entidades/evento-referencia.entity';
import { LocalidadEvento } from './entidades/localidad-evento.entity';
import { EsquemaCatalogo1790208000000 } from './migraciones/1790208000000-EsquemaCatalogo';

export const ENTIDADES = [EventoReferencia, LocalidadEvento];

export const MIGRACIONES = [EsquemaCatalogo1790208000000];

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

    // Nunca `synchronize: true`. Las restricciones CHECK que mantienen
    // coherente el cupo (`vendidas + reservadas <= aforo`) no se deducen de
    // las entidades: con `synchronize` desaparecerían sin aviso.
    synchronize: false,

    // Las migraciones se corren a mano. Con varias réplicas (ADR-14 pone tres
    // en Catálogo) arrancando a la vez, `migrationsRun` las haría competir por
    // migrar la misma base.
    migrationsRun: false,

    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

/** DataSource para la CLI de TypeORM. Dentro de la app la crea Nest. */
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
