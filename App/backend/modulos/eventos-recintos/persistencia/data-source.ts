import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../compartido/persistencia/esquemas';
import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { cargarConfiguracion, ConfiguracionEventos } from '../comun/config/configuracion';
import { CONEXION_EVENTOS } from './conexion';
import { Evento } from './entidades/evento.entity';
import { EventoSaliente } from './entidades/evento-saliente.entity';
import { HistorialEvento } from './entidades/historial-evento.entity';
import { Localidad } from './entidades/localidad.entity';
import { PlanoRecinto } from './entidades/plano-recinto.entity';
import { Recinto } from './entidades/recinto.entity';
import { ZonaRecinto } from './entidades/zona-recinto.entity';
import { EsquemaEventosRecintos1793700000000 } from './migraciones/1793700000000-EsquemaEventosRecintos';
import { Cu029RecintosZonas1793800000000 } from './migraciones/1793800000000-Cu029RecintosZonas';

cargarEnv();

export const ENTIDADES = [Recinto, ZonaRecinto, PlanoRecinto, Evento, Localidad, HistorialEvento, EventoSaliente];

export const MIGRACIONES = [EsquemaEventosRecintos1793700000000, Cu029RecintosZonas1793800000000];

export function opcionesDataSource(config: ConfiguracionEventos = cargarConfiguracion()): DataSourceOptions & { name: string } {
  return {
    name: CONEXION_EVENTOS,
    type: 'postgres',
    ...opcionesEsquema('eventos-recintos'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema(MIGRACIONES, 'eventos-recintos'),
    migrationsTableName: 'migraciones',
    synchronize: false,
    migrationsRun: false,
    extra: { ...opcionesSesion('eventos-recintos'), application_name: 'nucleo-eventos-recintos' },
  };
}

export default new DataSource(opcionesDataSource());
