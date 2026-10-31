import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../config/configuracion';
import { EventoReferencia } from './entidades/evento-referencia.entity';
import { Ingreso } from './entidades/ingreso.entity';
import { EsquemaAccesoQr1790467200000 } from './migraciones/1790467200000-EsquemaAccesoQr';
import { QrEntradas1790553600000 } from './migraciones/1790553600000-QrEntradas';
import { QrEntrada } from './entidades/qr-entrada.entity';
import { EventoSaliente } from './entidades/evento-saliente.entity';
import { BandejaSalida1790553600001 } from './migraciones/1790553600001-BandejaSalida';

export const ENTIDADES = [EventoReferencia, Ingreso, QrEntrada, EventoSaliente];
export const MIGRACIONES = [EsquemaAccesoQr1790467200000, QrEntradas1790553600000, BandejaSalida1790553600001];

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

    // Nunca `synchronize: true`: el UNIQUE(entrada_id) que impide el doble
    // ingreso no se deduce de la entidad, y perderlo sin aviso sería perder la
    // segunda defensa de CU-002D.
    synchronize: false,
    migrationsRun: false,
    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
