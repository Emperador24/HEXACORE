import { config as cargarEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../config/configuracion';
import { Cancelacion } from './entidades/cancelacion.entity';
import { CodigoPromocional } from './entidades/codigo-promocional.entity';
import { Compra } from './entidades/compra.entity';
import { Entrada } from './entidades/entrada.entity';
import { EventoReferencia } from './entidades/evento-referencia.entity';
import { HistorialPropietario } from './entidades/historial-propietario.entity';
import { Ingreso } from './entidades/ingreso.entity';
import { LocalidadEvento } from './entidades/localidad-evento.entity';
import { PublicacionReventa } from './entidades/publicacion-reventa.entity';
import { TransaccionReventa } from './entidades/transaccion-reventa.entity';
import { UsoPromocion } from './entidades/uso-promocion.entity';
import { EsquemaInicialCu0061789257600000 } from './migraciones/1789257600000-EsquemaInicialCu006';
import { SecuenciaNumeroTransaccion1789344000000 } from './migraciones/1789344000000-SecuenciaNumeroTransaccion';
import { CarteleraCu0051789776000000 } from './migraciones/1789776000000-CarteleraCu005';
import { VentaPrimariaCu001a0041789862400000 } from './migraciones/1789862400000-VentaPrimariaCu001a004';

export const ENTIDADES = [
  EventoReferencia,
  LocalidadEvento,
  Entrada,
  PublicacionReventa,
  TransaccionReventa,
  HistorialPropietario,
  Compra,
  CodigoPromocional,
  UsoPromocion,
  Ingreso,
  Cancelacion,
];

export const MIGRACIONES = [
  EsquemaInicialCu0061789257600000,
  SecuenciaNumeroTransaccion1789344000000,
  CarteleraCu0051789776000000,
  VentaPrimariaCu001a0041789862400000,
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

    // NUNCA `synchronize: true`, ni siquiera en desarrollo.
    //
    // `synchronize` deduce el esquema de las entidades, y hay cosas que una
    // entidad no puede expresar: el índice único parcial que impide dos
    // publicaciones activas de la misma entrada (RNF-01), las restricciones
    // CHECK que hacen cuadrar el reparto del dinero, y el disparador que hace
    // inmutable el historial (RNF-11). Con `synchronize` esas garantías
    // desaparecerían sin aviso, que es la peor forma de perderlas.
    synchronize: false,

    // Las migraciones se corren a mano (`npm run migracion:correr`), no al
    // arrancar: con varias réplicas del servicio (ASR-06) arrancando a la vez,
    // `migrationsRun` las haría competir por migrar la misma base.
    migrationsRun: false,

    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

/**
 * DataSource para la CLI de TypeORM (`migration:run`, `migration:revert`).
 *
 * Dentro de la aplicación NO se usa esta instancia: allí la crea Nest a través
 * de `PersistenciaModule`, para que el ciclo de vida de la conexión lo gestione
 * el contenedor de inyección de dependencias.
 */
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
