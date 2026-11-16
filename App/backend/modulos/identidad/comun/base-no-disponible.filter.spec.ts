import { QueryFailedError } from 'typeorm';
import { esFalloDeBase } from './base-no-disponible.filter';

/**
 * El filtro decide entre "503, la base no está" y "500, error del programa".
 * Equivocarse en un sentido esconde fallos del código tras un "inténtalo más
 * tarde"; en el otro, manda al usuario un error genérico por algo pasajero.
 */
describe('esFalloDeBase', () => {
  const conCodigo = (code: string) => new QueryFailedError('SELECT 1', [], Object.assign(new Error('x'), { code }));

  it.each([
    ['sin conexión libre en el pool', new Error('timeout exceeded when trying to connect')],
    ['la consulta no respondió', new Error('Query read timeout')],
    ['la conexión se cortó', new Error('Connection terminated due to connection timeout')],
    ['conexión rechazada', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
    ['statement_timeout (57014)', conCodigo('57014')],
    ['servidor apagándose (57P01)', conCodigo('57P01')],
    ['fallo de conexión (08006)', conCodigo('08006')],
  ])('503: %s', (_caso, error) => {
    expect(esFalloDeBase(error)).toBe(true);
  });

  it.each([
    ['violación de unicidad (23505)', conCodigo('23505')],
    ['violación de CHECK (23514)', conCodigo('23514')],
    ['error de sintaxis (42601)', conCodigo('42601')],
    ['un error cualquiera del programa', new TypeError('cannot read properties of undefined')],
    ['algo que no es un Error', 'timeout'],
  ])('no es de disponibilidad: %s', (_caso, error) => {
    expect(esFalloDeBase(error)).toBe(false);
  });
});
