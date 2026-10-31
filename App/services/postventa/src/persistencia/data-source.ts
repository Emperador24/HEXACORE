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

export function opcionesDataSource(config: ConfiguracionServicio): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: [__dirname + '/migraciones/*.{ts,js}'],
    // Nunca `synchronize`: el esquema lo gobiernan las migraciones, también en
    // desarrollo. Una tabla que aparece sola no deja constancia de por qué.
    synchronize: false,
    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

// Este DataSource es solo para la CLI de TypeORM (`npm run migracion:correr`).
// La aplicación usa el de PersistenciaModule.
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
