import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Empleado } from '../logistica/turnos-asistencia/entities/empleado.entity.js';
import { Notificacion } from '../logistica/turnos-asistencia/entities/notificacion.entity.js';
import { RegistroAsistencia } from '../logistica/turnos-asistencia/entities/registro-asistencia.entity.js';
import { SolicitudCambioTurno } from '../logistica/turnos-asistencia/entities/solicitud-cambio-turno.entity.js';
import { Turno } from '../logistica/turnos-asistencia/entities/turno.entity.js';
import { EsquemaInicialCu0181789718400000 } from './migraciones/1789718400000-EsquemaInicialCu018.js';

cargarEnv();

export const ENTIDADES = [Empleado, Turno, SolicitudCambioTurno, RegistroAsistencia, Notificacion];

export const MIGRACIONES = [EsquemaInicialCu0181789718400000];

export function opcionesDataSource(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'hexacore',
    password: process.env.DB_PASSWORD ?? 'hexacore',
    database: process.env.DB_NAME ?? 'eventos_emergencias',
    entities: ENTIDADES,
    migrations: MIGRACIONES,
    migrationsTableName: 'migraciones',
    // Nunca true: ver justificación en administracion/src/persistencia/data-source.ts.
    // Con TypeORM decidiendo el esquema solo, un cambio en una entidad puede
    // borrar una columna con datos sin avisar ni dejar rastro de qué cambió.
    synchronize: false,
    migrationsRun: false,
  };
}

export default new DataSource(opcionesDataSource());
