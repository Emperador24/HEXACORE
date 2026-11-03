import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../compartido/persistencia/esquemas';
import { config as cargarEnv } from 'dotenv';
import { CONEXION_LOGISTICA } from './conexion';
import { cargarConfiguracion, ConfiguracionLogistica } from '../comun/config/configuracion';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Empleado } from '../turnos-asistencia/entities/empleado.entity';
import { Notificacion } from '../turnos-asistencia/entities/notificacion.entity';
import { RegistroAsistencia } from '../turnos-asistencia/entities/registro-asistencia.entity';
import { SolicitudCambioTurno } from '../turnos-asistencia/entities/solicitud-cambio-turno.entity';
import { Turno } from '../turnos-asistencia/entities/turno.entity';
import { ZonaEvento } from '../turnos-asistencia/entities/zona-evento.entity';
import { EsquemaInicialCu0181789718400000 } from './migraciones/1789718400000-EsquemaInicialCu018';
import { Cu017PersonalOperativo1789750000000 } from './migraciones/1789750000000-Cu017PersonalOperativo';

cargarEnv();

export const ENTIDADES = [
  Empleado,
  Turno,
  SolicitudCambioTurno,
  RegistroAsistencia,
  Notificacion,
  ZonaEvento,
];

export const MIGRACIONES = [EsquemaInicialCu0181789718400000, Cu017PersonalOperativo1789750000000];

export function opcionesDataSource(config: ConfiguracionLogistica = cargarConfiguracion()): DataSourceOptions & { name: string } {
  return {
    name: CONEXION_LOGISTICA,
    type: 'postgres',
    ...opcionesEsquema('personal-logistica'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema(MIGRACIONES, 'personal-logistica'),
    migrationsTableName: 'migraciones',
    // Nunca true: se conservan las migraciones y los datos del servidor anterior.
    // Con TypeORM decidiendo el esquema solo, un cambio en una entidad puede
    // borrar una columna con datos sin avisar ni dejar rastro de qué cambió.
    synchronize: false,
    migrationsRun: false,
    extra: { ...opcionesSesion('personal-logistica'), application_name: 'nucleo-personal-logistica' },
  };
}

export default new DataSource(opcionesDataSource());
