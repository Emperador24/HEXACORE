import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarClavePublica } from './clave-publica';

/** Las negativas que protegen la verificación de tokens en producción. */
describe('cargarClavePublica', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'clave-publica-'));
  const archivo = (nombre: string, contenido: string) => {
    const ruta = join(carpeta, nombre);
    writeFileSync(ruta, contenido);
    return ruta;
  };
  const anterior = process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
  afterEach(() => {
    if (anterior === undefined) delete process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
    else process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = anterior;
  });

  it('en desarrollo usa la clave del repositorio y la reconoce como de desarrollo', () => {
    delete process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
    expect(cargarClavePublica(false)).toMatchObject({ deDesarrollo: true });
  });

  it('en producción exige la ruta y rechaza la clave de desarrollo', () => {
    delete process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO;
    expect(() => cargarClavePublica(true)).toThrow(/obligatoria/);
    const desarrollo = cargarClavePublica(false).pem;
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = archivo('dev.pem', desarrollo);
    expect(() => cargarClavePublica(true)).toThrow(/de desarrollo en producción/);
  });

  it('acepta en producción una RSA propia', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = archivo('rsa.pem', publicKey.export({ type: 'spki', format: 'pem' }).toString());
    expect(cargarClavePublica(true)).toMatchObject({ deDesarrollo: false });
  });

  it('rechaza un archivo que no existe, un PEM roto y una clave que no es RSA', () => {
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = join(carpeta, 'no-existe.pem');
    expect(() => cargarClavePublica(false)).toThrow(/No se pudo leer/);
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = archivo('roto.pem', 'no es un pem');
    expect(() => cargarClavePublica(false)).toThrow(/no es un PEM válido/);
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO = archivo('ec.pem', publicKey.export({ type: 'spki', format: 'pem' }).toString());
    expect(() => cargarClavePublica(false)).toThrow(/debe ser RSA/);
  });
});
