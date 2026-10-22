/**
 * Nombres de las conexiones a PostgreSQL del Núcleo.
 *
 * Antes de ADR-12 cada servicio abría **la conexión por defecto** de TypeORM
 * —un `forRoot` sin nombre—. En un solo proceso dos conexiones por defecto
 * colisionan: la segunda pisa a la primera y los repositorios de un módulo
 * acabarían consultando la base del otro.
 *
 * Nombrarlas es lo que permite que cada módulo conserve su propia base, su
 * propio pool y su propia secuencia de migraciones, que es la separación de
 * datos que ADR-12 mantiene de ADR-01. Al inyectar hay que decir cuál:
 *
 * ```ts
 * constructor(@InjectDataSource(CONEXION_PEDIDOS) private readonly bd: DataSource) {}
 * ```
 *
 * Sin el nombre, Nest busca la conexión por defecto, que aquí no existe, y el
 * fallo aparece al arrancar y no en producción.
 */

/** Conexión del módulo de Administración — base `administracion`. */
export const CONEXION_ADMINISTRACION = 'administracion';

/** Conexión del módulo de Pedidos — base `pedidos`. */
export const CONEXION_PEDIDOS = 'pedidos';
