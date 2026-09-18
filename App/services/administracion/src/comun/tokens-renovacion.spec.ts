import { randomBytes, randomUUID } from 'node:crypto';
import { emitirTokenRenovacion, leerTokenRenovacion } from './tokens-renovacion';

describe('tokens de renovación', () => {
  const clave = randomBytes(32);
  const sesion = randomUUID();

  it('lo emitido se lee con el mismo id y generación', () => {
    const token = emitirTokenRenovacion(sesion, 41, clave);
    expect(token).toMatch(/^[A-Za-z0-9_-]{70}$/);
    expect(leerTokenRenovacion(token, clave)).toEqual({ sesionId: sesion, generacion: 41 });
  });

  it('cada generación da un token distinto', () => {
    expect(emitirTokenRenovacion(sesion, 1, clave)).not.toBe(emitirTokenRenovacion(sesion, 2, clave));
  });

  it('otra clave no lo reconoce', () => {
    const token = emitirTokenRenovacion(sesion, 0, clave);
    expect(leerTokenRenovacion(token, randomBytes(32))).toBeNull();
  });

  it('cambiar la generación (o cualquier byte) lo invalida', () => {
    const bytes = Buffer.from(emitirTokenRenovacion(sesion, 5, clave), 'base64url');
    for (const posicion of [0, 15, 19, 20, 51]) {
      const alterado = Buffer.from(bytes);
      alterado[posicion] ^= 0x01;
      expect(leerTokenRenovacion(alterado.toString('base64url'), clave)).toBeNull();
    }
  });

  it.each([
    ['vacío', ''],
    ['corto', 'abc'],
    ['largo de más', 'a'.repeat(71)],
    ['caracteres fuera de base64url', '+'.repeat(70)],
    ['no es texto', 42],
    ['nulo', null],
  ])('rechaza sin lanzar: %s', (_caso, valor) => {
    expect(leerTokenRenovacion(valor, clave)).toBeNull();
  });

  it('rechaza generaciones fuera de rango al emitir', () => {
    expect(() => emitirTokenRenovacion(sesion, -1, clave)).toThrow();
    expect(() => emitirTokenRenovacion(sesion, 2 ** 32, clave)).toThrow();
  });
});
