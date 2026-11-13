import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarConfiguracion } from './configuracion';

/** Postventa se niega a arrancar mal configurada, en vez de fallar a mitad de un checkout. */
describe('cargarConfiguracion (Postventa)', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  const con = (entorno: Record<string, string>) => {
    process.env = { ...original, ...entorno };
    return () => cargarConfiguracion();
  };

  it('arranca con los valores por defecto', () => {
    expect(con({})()).toMatchObject({ reventa: { topePrecioFactor: 1.5, comisionPorcentaje: 10, bloqueoTtlSegundos: 120 } });
  });

  it('rechaza números ilegibles, decimales donde va un entero y un NODE_ENV desconocido', () => {
    expect(con({ REVENTA_TOPE_PRECIO_FACTOR: 'mucho' })).toThrow(/debe ser numérica/);
    expect(con({ REVENTA_BLOQUEO_TTL_SEGUNDOS: '1.5' })).toThrow(/debe ser un entero/);
    expect(con({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV inválido/);
  });

  it('rechaza reglas de reventa que no protegen nada', () => {
    expect(con({ REVENTA_TOPE_PRECIO_FACTOR: '0.9' })).toThrow(/>= 1/);
    expect(con({ REVENTA_COMISION_PORCENTAJE: '100' })).toThrow(/\[0, 100\)/);
    expect(con({ REVENTA_BLOQUEO_TTL_SEGUNDOS: '0' })).toThrow(/debe ser > 0/);
    expect(con({ VENTAS_TIMEOUT_MS: '0' })).toThrow(/VENTAS_TIMEOUT_MS/);
    expect(con({ REVENTA_BLOQUEO_TTL_SEGUNDOS: '10' })).toThrow(/debe superar la espera máxima/);
  });

  it('en producción exige el token entre servicios', () => {
    expect(con({ NODE_ENV: 'production', POSTGRES_CONTRASENA: 'secreta', TOKEN_SERVICIOS: ' ' })).toThrow(/Falta la variable de entorno TOKEN_SERVICIOS/);
  });

  it('en producción arranca con el token, la contraseña de la base y una clave RSA propia', () => {
    const clave = join(mkdtempSync(join(tmpdir(), 'postventa-')), 'publica.pem');
    writeFileSync(clave, generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString());
    const config = con({ NODE_ENV: 'production', POSTGRES_CONTRASENA: 'secreta', TOKEN_SERVICIOS: ' token-de-produccion ',
      AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: clave })();
    expect(config).toMatchObject({ entorno: 'production', tokenServicios: 'token-de-produccion' });
  });
});
