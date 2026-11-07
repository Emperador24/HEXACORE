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

/**
 * CU-009: ventana de la asistencia respecto al horario del turno, en minutos.
 *
 * - Se acepta una entrada hasta `ENTRADA_ANTICIPADA_MAX` antes del inicio
 *   (CU-009A); más temprano no hay turno contra el que registrarla.
 * - Dentro de `TOLERANCIA_PUNTUALIDAD` del inicio o del fin se considera a
 *   tiempo; fuera, anticipada, tardía (CU-009B) o posterior (CU-009C).
 * - Una salida se acepta hasta `SALIDA_POSTERIOR_MAX` después del fin.
 */
export const ENTRADA_ANTICIPADA_MAX = 60;
export const TOLERANCIA_PUNTUALIDAD = 10;
export const SALIDA_POSTERIOR_MAX = 4 * 60;
