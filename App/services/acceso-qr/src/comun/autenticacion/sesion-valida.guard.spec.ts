import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHmac, generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PREFIJO_REVOCADA, RolesPermitidos, SesionValida } from './sesion-valida.guard';

/**
 * El guard es la única puerta del servicio (RNF-06). Se prueba con claves RSA
 * reales generadas aquí, no con dobles de `JwtService`: lo que interesa es
 * justamente que la verificación criptográfica rechace lo que debe.
 */
describe('SesionValida', () => {
  const EMISOR = 'hexacore-administracion';
  const USUARIO = 'a0000001-0000-4000-8000-000000000001';

  const legitima = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ajena = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = (k: KeyObject, tipo: 'spki' | 'pkcs8') => k.export({ type: tipo, format: 'pem' }).toString();

  const clavePublica = pem(legitima.publicKey, 'spki');
  const emisor = new JwtService({ privateKey: pem(legitima.privateKey, 'pkcs8'), signOptions: { algorithm: 'RS256', issuer: EMISOR } });
  const impostor = new JwtService({ privateKey: pem(ajena.privateKey, 'pkcs8'), signOptions: { algorithm: 'RS256', issuer: EMISOR } });
  const verificador = new JwtService({ publicKey: clavePublica, verifyOptions: { algorithms: ['RS256'], issuer: EMISOR } });

  let redis: { exists: jest.Mock };
  let guard: SesionValida;

  beforeEach(() => {
    redis = { exists: jest.fn().mockResolvedValue(0) };
    guard = new SesionValida(verificador, new Reflector(), redis as unknown as Redis);
  });

  class Controlador {
    cliente(): void {}
    administrador(): void {}
  }
  RolesPermitidos('Cliente')(Controlador);
  RolesPermitidos('Administrador')(Controlador.prototype, 'administrador', Object.getOwnPropertyDescriptor(Controlador.prototype, 'administrador')!);

  function contexto(autorizacion?: string, ruta: 'cliente' | 'administrador' = 'cliente') {
    const peticion: Record<string, unknown> = { headers: autorizacion ? { authorization: autorizacion } : {} };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => peticion }),
      getHandler: () => Controlador.prototype[ruta],
      getClass: () => Controlador,
    } as unknown as ExecutionContext;
    return { ctx, peticion };
  }

  const firmar = (servicio: JwtService, contenido: object = {}, opciones: object = {}) => {
    const datos = { sub: USUARIO, roles: ['Cliente'], jti: randomUUID(), exp: Math.floor(Date.now() / 1000) + 900, ...contenido };
    return servicio.sign(Object.fromEntries(Object.entries(datos).filter(([, valor]) => valor !== undefined)), opciones);
  };

  async function codigoDe(promesa: Promise<unknown>): Promise<[number, string]> {
    try {
      await promesa;
    } catch (error) {
      const e = error as HttpException;
      return [e.getStatus(), (e.getResponse() as { codigo: string }).codigo];
    }
    throw new Error('se esperaba un rechazo');
  }

  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

  it('acepta un token legítimo y deja la sesión en la petición', async () => {
    const { ctx, peticion } = contexto(`Bearer ${firmar(emisor)}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(peticion.sesion).toMatchObject({ usuarioId: USUARIO, roles: ['Cliente'] });
  });

  it.each([
    ['sin cabecera', undefined],
    ['esquema distinto', 'Basic abc'],
    ['la antigua X-Usuario-Id no cuenta', undefined],
    ['basura', 'Bearer no.es.un-token'],
  ])('rechaza: %s', async (_caso, cabecera) => {
    expect(await codigoDe(guard.canActivate(contexto(cabecera).ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it('rechaza un token firmado con otra clave', async () => {
    const { ctx } = contexto(`Bearer ${firmar(impostor)}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it('rechaza alg none', async () => {
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: USUARIO, roles: ['Administrador'], jti: 'x', iss: EMISOR })}.`;
    expect(await codigoDe(guard.canActivate(contexto(`Bearer ${token}`).ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it('rechaza un HS256 "firmado" con la clave pública como secreto (confusión de algoritmo)', async () => {
    // La clave pública es pública: si el verificador aceptara HS256, cualquiera
    // podría usarla como secreto HMAC y fabricar tokens válidos.
    const entrada = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USUARIO, roles: ['Administrador'], jti: 'x', iss: EMISOR, exp: Math.floor(Date.now() / 1000) + 600 })}`;
    const firma = createHmac('sha256', clavePublica).update(entrada).digest('base64url');
    expect(await codigoDe(guard.canActivate(contexto(`Bearer ${entrada}.${firma}`, 'administrador').ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it('rechaza un token caducado', async () => {
    const { ctx } = contexto(`Bearer ${firmar(emisor, { exp: Math.floor(Date.now() / 1000) - 10 })}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it('rechaza un token de otro emisor', async () => {
    const { ctx } = contexto(`Bearer ${firmar(emisor, {}, { issuer: 'otro-servicio' })}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it.each([
    ['sub que no es UUID', { sub: "' OR 1=1 --" }],
    ['sin roles', { roles: undefined }],
    ['roles que no son texto', { roles: [1] }],
    ['sin jti', { jti: undefined }],
    ['jti inválido', { jti: 'x' }],
    ['sin expiración', { exp: undefined }],
    ['duración superior a 60 minutos', { exp: Math.floor(Date.now() / 1000) + 7200 }],
  ])('rechaza un token bien firmado pero malformado: %s', async (_caso, cambios) => {
    const { ctx } = contexto(`Bearer ${firmar(emisor, cambios)}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([401, 'SIN_AUTENTICAR']);
  });

  it('rechaza una sesión revocada, consultando la clave acordada', async () => {
    redis.exists.mockResolvedValue(1);
    const jti = randomUUID();
    const { ctx } = contexto(`Bearer ${firmar(emisor, { jti })}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([401, 'SIN_AUTENTICAR']);
    expect(redis.exists).toHaveBeenCalledWith(`${PREFIJO_REVOCADA}${jti}`);
  });

  it('falla cerrado (503) si Redis no responde', async () => {
    redis.exists.mockRejectedValue(new Error('ECONNREFUSED'));
    const { ctx } = contexto(`Bearer ${firmar(emisor)}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([503, 'SESIONES_NO_DISPONIBLES']);
  });

  it('exige el rol del controlador', async () => {
    const { ctx } = contexto(`Bearer ${firmar(emisor, { roles: ['Personal'] })}`);
    expect(await codigoDe(guard.canActivate(ctx))).toEqual([403, 'ROL_INSUFICIENTE']);
  });

  it('el rol de la ruta sustituye al del controlador', async () => {
    const cliente = contexto(`Bearer ${firmar(emisor)}`, 'administrador');
    expect(await codigoDe(guard.canActivate(cliente.ctx))).toEqual([403, 'ROL_INSUFICIENTE']);

    const admin = contexto(`Bearer ${firmar(emisor, { roles: ['Administrador', 'Personal'] })}`, 'administrador');
    await expect(guard.canActivate(admin.ctx)).resolves.toBe(true);
  });
});
