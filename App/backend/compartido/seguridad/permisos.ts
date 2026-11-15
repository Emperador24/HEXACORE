/**
 * Contrato de los permisos dinámicos (CU-028) entre Identidad, que los define,
 * y los módulos que los aplican. Ver `App/shared/seguridad/permisos.md`.
 *
 * ## Qué es dinámico y qué no
 *
 * Los cuatro roles del sistema (`Cliente`, `Personal`, `Organizador`,
 * `Administrador`) conservan las reglas fijas que cada ruta declara con
 * `@RolesPermitidos`: sostienen el registro, la compra y la operación, y
 * cambiarlas desde una pantalla podría dejar el sistema sin quien lo opere.
 * Lo que el administrador crea son **roles propios**, con una matriz de
 * permisos por módulo y acción, que se suman a esas reglas: una ruta cerrada
 * a un rol fijo se abre a quien tenga un rol propio con el permiso de su
 * módulo para esa acción.
 *
 * ## Por qué viven en Redis
 *
 * Los tokens congelan los roles al iniciar sesión y duran 15 minutos. CU-028B
 * exige que restringir un permiso alcance a las sesiones abiertas *"sin
 * necesidad de reiniciar sesión"*, así que el permiso no puede ir en el token.
 * Identidad publica aquí la matriz de cada rol propio y los roles vigentes de
 * quien acaba de cambiar; las guardas los leen en cada petición, en el mismo
 * viaje a Redis en que ya comprueban si la sesión fue revocada. La base sigue
 * siendo la fuente de verdad: Identidad reconstruye las matrices al arrancar.
 */

/** Los roles fijos. Su comportamiento lo declara el código, no la matriz. */
export const ROLES_DEL_SISTEMA: readonly string[] = ['Cliente', 'Personal', 'Organizador', 'Administrador'];

/**
 * Módulos sobre los que se pueden conceder permisos (paso 4 del CU-028).
 *
 * Ninguno es sensible en el sentido del CU (*"pagos, datos personales"*):
 * Pagos y la administración de cuentas no se ofrecen y siguen cerrados a
 * cualquier rol propio, que es el *"menor privilegio"* que pide la ficha.
 */
export const MODULOS_PERMISO = {
  eventos: 'Eventos y recintos',
  personal: 'Personal y logística',
  parqueaderos: 'Parqueaderos',
  emergencias: 'Emergencias y evacuación',
  reportes: 'Monitoreo y reportes',
} as const;

export type ModuloPermiso = keyof typeof MODULOS_PERMISO;

export const ACCIONES_PERMISO = ['leer', 'crear', 'actualizar', 'eliminar'] as const;

export type AccionPermiso = (typeof ACCIONES_PERMISO)[number];

/** Matriz de un rol propio: `modulo:accion`, p. ej. `parqueaderos:leer`. */
export const PREFIJO_PERMISOS_ROL = 'permisos-rol:';

/**
 * Roles vigentes de una cuenta cuyos roles acaban de cambiar.
 *
 * Vive lo que puede vivir un token emitido antes del cambio (más un margen):
 * pasado ese tiempo, cualquier token en circulación ya se emitió con los
 * roles nuevos y la clave sobra.
 */
export const PREFIJO_ROLES_USUARIO = 'roles-usuario:';

export function esRolDelSistema(rol: string): boolean {
  return ROLES_DEL_SISTEMA.includes(rol);
}

export function esModuloPermiso(valor: unknown): valor is ModuloPermiso {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(MODULOS_PERMISO, valor);
}

export function esAccionPermiso(valor: unknown): valor is AccionPermiso {
  return typeof valor === 'string' && (ACCIONES_PERMISO as readonly string[]).includes(valor);
}

/** La acción que pide una petición, si la ruta no declara otra. */
export function accionDeMetodo(metodo: string): AccionPermiso {
  switch (metodo.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'leer';
    case 'PUT':
    case 'PATCH':
      return 'actualizar';
    case 'DELETE':
      return 'eliminar';
    default:
      return 'crear';
  }
}

export const permiso = (modulo: ModuloPermiso, accion: AccionPermiso): string => `${modulo}:${accion}`;
