export const MAX_HORAS_POR_TURNO = 12;
export const MAX_HORAS_DIARIAS_EMPLEADO = 14;

/**
 * El área cuyo trabajo es supervisar al resto: es quien aprueba o rechaza los
 * cambios de turno (CU-018, paso 4).
 *
 * Va aquí y no como literal suelto porque la comparación ocurre en dos sitios
 * —al revisar una solicitud y al decidir qué pantallas ve la app— y dos
 * literales iguales se separan a la primera corrección.
 */
export const JEFE_DE_PERSONAL = 'Jefe de personal';

/**
 * Roles de cuenta (CU-027) que mandan en logística sin necesidad de tener
 * ficha de empleado: quien organiza el evento desde el portal web y quien
 * administra el sistema.
 *
 * Deliberadamente **no** incluye `Personal`: ese rol lo lleva todo el mundo
 * que trabaja aquí, el Jefe de personal incluido, así que no distingue nada.
 * Para eso está `JEFE_DE_PERSONAL`, que se comprueba contra la ficha local.
 */
export const ROLES_DE_CUENTA_QUE_SUPERVISAN: readonly string[] = [
  'Organizador',
  'Administrador',
];
