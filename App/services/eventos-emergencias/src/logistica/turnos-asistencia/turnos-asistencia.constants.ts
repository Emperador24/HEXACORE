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
