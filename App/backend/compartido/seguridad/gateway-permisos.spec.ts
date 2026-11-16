import { createSign, generateKeyPairSync, randomUUID, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

/** Ejecuta el JS real de njs con firma RSA real; solo el objeto de Nginx y su fs son dobles. */
describe('Gateway: asignaciones CU-028 sobre sesiones abiertas', () => {
  const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publica = par.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const fuente = readFileSync(resolve(__dirname, '../../../gateway/autenticacion.js'), 'utf8')
    .replace("import fs from 'fs';", '')
    .replace('export default { verificar };', 'globalThis.api = { verificar };');

  function token(roles: string[], cambios: Record<string, unknown> = {}) {
    const ahora = Math.floor(Date.now() / 1000);
    const carga = { sub: randomUUID(), jti: randomUUID(), roles, iss: 'hexacore-administracion', iat: ahora, exp: ahora + 900, ...cambios };
    const texto = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(carga)).toString('base64url');
    return texto + '.' + createSign('RSA-SHA256').update(texto).sign(par.privateKey, 'base64url');
  }

  async function verificar(bearer: string | undefined, modulo = '', requeridos = 'Organizador') {
    const entorno: { api?: { verificar: (r: unknown) => Promise<void> }; [k: string]: unknown } = {
      Buffer,
      // njs admite texto en verify; WebCrypto de Node exige los mismos bytes.
      crypto: { subtle: {
        importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle),
        verify: (algoritmo: webcrypto.AlgorithmIdentifier, clave: webcrypto.CryptoKey, firma: Buffer, texto: string) =>
          webcrypto.subtle.verify(algoritmo, clave, firma, Buffer.from(texto)),
      } },
      fs: { readFileSync: () => publica },
      ngx: { fetch: () => { throw new Error('Esta lectura no debe consumir un turno'); } },
    };
    runInNewContext(fuente, entorno);
    let status: number | undefined;
    const r = { headersIn: { Authorization: bearer }, headersOut: {},
      variables: { roles_requeridos: requeridos, modulo_permiso: modulo },
      return: (valor: number) => { status = valor; }, error: jest.fn() };
    await entorno.api!.verificar(r);
    return status;
  }

  it.each(['eventos', 'personal', 'parqueaderos', 'emergencias', 'reportes'])('delega %s con el token anterior a una asignación, aunque solo lleve Cliente/Personal', async (modulo) => {
    for (const rol of ['Cliente', 'Personal']) expect(await verificar('Bearer ' + token([rol]), modulo)).toBe(204);
  });

  it('conserva el rechazo por rol en rutas sensibles sin módulo dinámico', async () => {
    for (const rol of ['Cliente', 'Personal', 'Organizador', 'Propio']) {
      expect(await verificar('Bearer ' + token([rol]), '', 'Administrador')).toBe(403);
    }
    expect(await verificar('Bearer ' + token(['Administrador']), '', 'Administrador')).toBe(204);
  });

  it('delegar permisos no admite falta de token, caducidad o firma falsificada', async () => {
    expect(await verificar(undefined, 'eventos')).toBe(401);
    expect(await verificar('Bearer ' + token(['Cliente'], { exp: Math.floor(Date.now() / 1000) - 1 }), 'eventos')).toBe(401);
    const partes = token(['Cliente']).split('.');
    partes[1] = Buffer.from(JSON.stringify({ sub: randomUUID(), roles: ['Administrador'] })).toString('base64url');
    expect(await verificar('Bearer ' + partes.join('.'), 'eventos')).toBe(401);
  });
});
