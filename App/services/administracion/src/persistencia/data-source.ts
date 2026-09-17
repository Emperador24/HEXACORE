import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../config/configuracion';
import { Rol } from './entidades/rol.entity';
import { Sesion } from './entidades/sesion.entity';
import { TokenCuenta } from './entidades/token-cuenta.entity';
import { Usuario } from './entidades/usuario.entity';
import { UsuarioRol } from './entidades/usuario-rol.entity';
import { AuditoriaCuenta } from './entidades/auditoria-cuenta.entity';
import { EsquemaInicialCu0271789430400000 } from './migraciones/1789430400000-EsquemaInicialCu027';
import { AdministracionCuentasCu027b1789516800000 } from './migraciones/1789516800000-AdministracionCuentasCu027b';
import { RenovacionSesiones1789603200000 } from './migraciones/1789603200000-RenovacionSesiones';

export const ENTIDADES = [Rol, Usuario, UsuarioRol, Sesion, TokenCuenta, AuditoriaCuenta];

export const MIGRACIONES = [
  EsquemaInicialCu0271789430400000,
  AdministracionCuentasCu027b1789516800000,
  RenovacionSesiones1789603200000,
];

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

    // Nunca `synchronize: true`: deduciría el esquema de las entidades y se
    // llevaría por delante los CHECK que mantienen coherente el estado de una
    // cuenta, el que fuerza el correo a minúsculas y el que impide guardar un
    // token en claro. Con `synchronize` desaparecerían sin aviso.
    synchronize: false,
    migrationsRun: false,

    // Límites de espera (DECISIONES.md §17). Los dos del cliente son los que
    // importan con una base **colgada**: `statement_timeout` lo aplica el
    // propio servidor, y un servidor que no responde no aplica nada.
    extra: {
      max: config.postgres.maxConexiones,
      // Esperando una conexión libre del pool (o abriendo una nueva).
      connectionTimeoutMillis: config.postgres.esperaMaximaMs,
      // Esperando la respuesta de una consulta, medido en el cliente.
      query_timeout: config.postgres.esperaMaximaMs,
      // Y en el servidor, por si una consulta se atasca allí (un bloqueo).
      statement_timeout: config.postgres.esperaMaximaMs,
    },

    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

/** DataSource para la CLI de TypeORM. Dentro de la aplicación la crea Nest. */
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
