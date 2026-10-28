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
 *
 * ## El nombre hay que ponerlo en DOS sitios
 *
 * En `forRootAsync` no basta con `name:` arriba: hay que repetirlo **dentro de
 * lo que devuelve `useFactory`**.
 *
 * ```ts
 * TypeOrmModule.forRootAsync({
 *   name: CONEXION_PEDIDOS,                                    // 1
 *   useFactory: (c) => ({ ...opcionesDataSource(c),
 *                         name: CONEXION_PEDIDOS }),           // 2 — también
 * })
 * ```
 *
 * `TypeOrmCoreModule` guarda como `this.options` el **resultado de la
 * fábrica**, no el argumento de `forRootAsync`, y su gancho de apagado decide
 * con él qué `DataSource` cerrar. Con el nombre solo arriba, al apagar busca
 * el token por defecto y lanza `UnknownElementException: Nest could not find
 * DataSource element`.
 *
 * Es un fallo silencioso y tardío: todo funciona hasta que llega el SIGTERM, y
 * entonces ensucia justo el cierre ordenado que RNF-15 necesita limpio.
 */

/** Conexión del módulo de Administración — base `administracion`. */
export const CONEXION_ADMINISTRACION = 'administracion';

/** Conexión del módulo de Pedidos — base `pedidos`. */
export const CONEXION_PEDIDOS = 'pedidos';
