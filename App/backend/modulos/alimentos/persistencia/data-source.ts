import { opcionesEsquema, opcionesSesion, migracionesEnEsquema } from '../../../compartido/persistencia/esquemas';
import { config as cargarEnv } from 'dotenv';
import { CONEXION_ALIMENTOS } from './conexion';
import { DataSource, DataSourceOptions, EntitySchema } from 'typeorm';
import { ConfiguracionServicio, cargarConfiguracion } from '../comun/config/configuracion';
import { ReservaInventario } from './entidades/reserva-inventario.entity';
import { ReservasInventarioCu0111790000000000 } from './migraciones/1790000000000-ReservasInventarioCu011';
import { EventoReferencia } from './entidades/evento-referencia.entity';
import { Establecimiento } from './entidades/establecimiento.entity';
import { Producto } from './entidades/producto.entity';
import { Pedido } from './entidades/pedido.entity';
import { DetallePedido } from './entidades/detalle-pedido.entity';
import { TransaccionPedido } from './entidades/transaccion-pedido.entity';
import { EsquemaInicialCu0111789902006180 } from './migraciones/1789902006180-EsquemaInicialCu011';

export const ENTIDADES: (Function | EntitySchema)[] = [
  EventoReferencia,
  Establecimiento,
  Producto,
  Pedido,
  DetallePedido,
  TransaccionPedido,
  ReservaInventario,
];

export const MIGRACIONES = [
  EsquemaInicialCu0111789902006180,
  ReservasInventarioCu0111790000000000,
];

export function opcionesDataSource(config: ConfiguracionServicio): DataSourceOptions & { name: string } {
  return {
    name: CONEXION_ALIMENTOS,
    type: 'postgres',
    ...opcionesEsquema('alimentos'),
    host: config.postgres.host,
    port: config.postgres.puerto,
    username: config.postgres.usuario,
    password: config.postgres.contrasena,
    database: config.postgres.base,
    entities: ENTIDADES,
    migrations: migracionesEnEsquema(MIGRACIONES, 'alimentos'),
    migrationsTableName: 'migraciones',

    // El esquema se administra mediante migraciones explícitas.
    synchronize: false,
    migrationsRun: false,

    // Límites del pool y de espera, siguiendo el servicio de Administración.
    extra: { ...opcionesSesion('alimentos'),
      application_name: 'nucleo-alimentos',
      max: config.postgres.maxConexiones,
      connectionTimeoutMillis: config.postgres.esperaMaximaMs,
      query_timeout: config.postgres.esperaMaximaMs,
      statement_timeout: config.postgres.esperaMaximaMs,
    },

    logging: config.entorno === 'development' ? ['error', 'warn', 'migration'] : ['error'],
  };
}

/** DataSource para la CLI de TypeORM. Dentro de la aplicación la crea Nest. */
cargarEnv();
export default new DataSource(opcionesDataSource(cargarConfiguracion()));
