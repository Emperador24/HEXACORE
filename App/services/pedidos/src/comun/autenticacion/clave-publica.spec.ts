import { resolve } from 'node:path';
import { cargarClavePublica } from './clave-publica';

describe('cargarClavePublica', () => {
  const original = process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;

  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
    else process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = original;
  });

  it('carga la clave pública de desarrollo por defecto', () => {
    delete process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
    expect(cargarClavePublica(false).deDesarrollo).toBe(true);
  });

  it('exige una ruta explícita en producción', () => {
    delete process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
    expect(() => cargarClavePublica(true)).toThrow('obligatoria');
  });

  it('rechaza la clave de desarrollo en producción aunque se configure explícitamente', () => {
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = resolve(__dirname, '../../../../../infra/claves-desarrollo/jwt-publica.pem');
    expect(() => cargarClavePublica(true)).toThrow('desarrollo en producción');
  });
});
