import { DataSource, EntityManager } from 'typeorm';

/**
 * Doble de la base de datos para las pruebas de la venta primaria (CU-001 a
 * CU-004).
 *
 * `transaction(cb)` ejecuta `cb` con el mismo gestor que `manager`, así una
 * prueba programa las respuestas una sola vez y vale igual dentro y fuera de
 * una transacción. Cada método es un `jest.fn()` que la prueba configura según
 * el camino que quiera ejercitar.
 *
 * Vive fuera de `src/` para no contar en la cobertura: es andamiaje de prueba,
 * no lógica del servicio.
 */
export function baseDatosFalsa() {
  const gestor = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    insert: jest.fn().mockResolvedValue({}),
    create: jest.fn((_entidad: unknown, datos: object) => ({ ...datos })),
    save: jest.fn((entidad: object) => Promise.resolve({ id: 'generado-por-la-base', registradoEn: new Date(), ...entidad })),
    query: jest.fn().mockResolvedValue([{ valor: '1' }]),
  };
  const fuenteDatos = {
    manager: gestor,
    transaction: jest.fn((cb: (tx: EntityManager) => unknown) => cb(gestor as unknown as EntityManager)),
  };
  return { gestor, fuenteDatos: fuenteDatos as unknown as DataSource };
}

export type GestorFalso = ReturnType<typeof baseDatosFalsa>['gestor'];
