import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { accionDeMetodo, esAccionPermiso, esModuloPermiso, esRolDelSistema } from './permisos';
import {
  AccionPermiso,
  ModuloPermisos,
  PeticionConSesion,
  RolesPermitidos,
  SesionValida,
  tienePermiso,
} from './sesion-valida.guard';

/**
 * Guarda común del Núcleo con los permisos dinámicos de CU-028. Las claves RSA
 * son reales; Redis es un doble en memoria con la misma forma de `multi()`.
 */
describe('SesionValida (Núcleo, CU-028)', () => {
  const EMISOR = 'hexacore-administracion';
  const USUARIO = 'a0000001-0000-4000-8000-000000000001';
  const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = (k: KeyObject, tipo: 'spki' | 'pkcs8') => k.export({ type: tipo, format: 'pem' }).toString();
  const emisor = new JwtService({ privateKey: pem(par.privateKey, 'pkcs8'), signOptions: { algorithm: 'RS256', issuer: EMISOR } });
  const verificador = new JwtService({ publicKey: pem(par.publicKey, 'spki'), verifyOptions: { algorithms: ['RS256'], issuer: EMISOR } });

  /** Redis en memoria: cadenas y conjuntos, con `multi()` que acumula y `exec()` que responde. */
  class RedisFalso {
    cadenas = new Map<string, string>();
    conjuntos = new Map<string, string[]>();
    caido = false;
    multi() {
      const operaciones: (() => unknown)[] = [];
      const lote = {
        exists: (k: string) => (operaciones.push(() => (this.cadenas.has(k) ? 1 : 0)), lote),
        get: (k: string) => (operaciones.push(() => this.cadenas.get(k) ?? null), lote),
        smembers: (k: string) => (operaciones.push(() => this.conjuntos.get(k) ?? []), lote),
        exec: async () => {
          if (this.caido) throw new Error('ECONNREFUSED');
          return operaciones.map((o) => [null, o()]);
        },
      };
      return lote;
    }
  }

  let redis: RedisFalso;
  let guard: SesionValida;

  beforeEach(() => {
    redis = new RedisFalso();
    guard = new SesionValida(verificador, new Reflector(), redis as unknown as Redis);
  });

  class Controlador {
    leer(): void {}
    publicar(): void {}
    libre(): void {}
  }
  RolesPermitidos('Organizador')(Controlador);
  ModuloPermisos('eventos')(Controlador);
  const descriptor = (m: string) => Object.getOwnPropertyDescriptor(Controlador.prototype, m)!;
  AccionPermiso('actualizar')(Controlador.prototype, 'publicar', descriptor('publicar'));

  class SinModulo {
    leer(): void {}
  }
  RolesPermitidos('Organizador')(SinModulo);

  class Abierto {
    leer(): void {}
  }

  const firmar = (roles: string[], extra: Record<string, unknown> = {}) =>
    emisor.signAsync({ roles, ...extra }, { subject: USUARIO, jwtid: randomUUID(), expiresIn: '5m' });

  function contexto(token: string | null, clase: object, metodo: string, verbo = 'GET') {
    const peticion = { method: verbo, headers: token ? { authorization: `Bearer ${token}` } : {} } as PeticionConSesion;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => peticion }),
      getHandler: () => (clase as { prototype: Record<string, unknown> }).prototype[metodo],
      getClass: () => clase,
    } as unknown as ExecutionContext;
    return { ctx, peticion };
  }

  async function estado(promesa: Promise<unknown>): Promise<{ status: number; codigo?: string }> {
    try {
      await promesa;
      return { status: 200 };
    } catch (e) {
      const h = e as HttpException;
      return { status: h.getStatus(), codigo: (h.getResponse() as { codigo?: string }).codigo };
    }
  }

  it('sin token, con token ajeno o con contenido incompleto: 401', async () => {
    expect(await estado(guard.canActivate(contexto(null, Abierto, 'leer').ctx))).toEqual({ status: 401, codigo: 'SIN_AUTENTICAR' });
    expect((await estado(guard.canActivate(contexto('basura', Abierto, 'leer').ctx))).status).toBe(401);
    const sinRoles = await emisor.signAsync({}, { subject: USUARIO, jwtid: randomUUID(), expiresIn: '5m' });
    expect((await estado(guard.canActivate(contexto(sinRoles, Abierto, 'leer').ctx))).status).toBe(401);
  });

  it('una sesión revocada no pasa, y sin Redis responde 503 en vez de abrir', async () => {
    const token = await firmar(['Organizador']);
    const { jti } = verificador.decode(token) as { jti: string };
    redis.cadenas.set(`sesion-revocada:${jti}`, '1');
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).status).toBe(401);
    redis.cadenas.clear();
    redis.caido = true;
    expect(await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).toEqual({ status: 503, codigo: 'SESIONES_NO_DISPONIBLES' });
  });

  it('un rol del sistema permitido entra sin leer matrices', async () => {
    const { ctx, peticion } = contexto(await firmar(['Organizador']), Controlador, 'leer');
    const smembers = jest.spyOn(redis, 'multi');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(smembers).toHaveBeenCalledTimes(1);
    expect(peticion.sesion).toMatchObject({ usuarioId: USUARIO, roles: ['Organizador'], permisos: [] });
  });

  it('un rol propio entra solo con el permiso del módulo para la acción de la ruta', async () => {
    const token = await firmar(['Personal', 'Supervisor']);
    redis.conjuntos.set('permisos-rol:Supervisor', ['eventos:leer']);
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).status).toBe(200);
    // POST sin acción declarada es `crear`; `publicar` declara `actualizar`.
    expect(await estado(guard.canActivate(contexto(token, Controlador, 'leer', 'POST').ctx))).toEqual({ status: 403, codigo: 'ROL_INSUFICIENTE' });
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'publicar', 'POST').ctx))).status).toBe(403);
    redis.conjuntos.set('permisos-rol:Supervisor', ['eventos:leer', 'eventos:actualizar']);
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'publicar', 'POST').ctx))).status).toBe(200);
    // Una ruta sin módulo de la matriz no se abre con permisos.
    expect((await estado(guard.canActivate(contexto(token, SinModulo, 'leer').ctx))).status).toBe(403);
  });

  it('CU-028B: retirar el permiso cierra la ruta a la misma sesión en la petición siguiente', async () => {
    const token = await firmar(['Supervisor']);
    redis.conjuntos.set('permisos-rol:Supervisor', ['eventos:leer']);
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).status).toBe(200);
    redis.conjuntos.set('permisos-rol:Supervisor', []);
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).status).toBe(403);
  });

  it('los roles vigentes en Redis mandan sobre los del token; un valor roto se ignora', async () => {
    const token = await firmar(['Organizador']);
    redis.cadenas.set(`roles-usuario:${USUARIO}`, JSON.stringify(['Cliente']));
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).status).toBe(403);
    redis.cadenas.set(`roles-usuario:${USUARIO}`, JSON.stringify(['Cliente', 'Taquilla']));
    redis.conjuntos.set('permisos-rol:Taquilla', ['eventos:leer']);
    const { ctx, peticion } = contexto(token, Controlador, 'leer');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(peticion.sesion).toMatchObject({ roles: ['Cliente', 'Taquilla'], permisos: ['eventos:leer'] });
    expect(tienePermiso(peticion, 'eventos')).toBe(true);
    expect(tienePermiso(peticion, 'eventos', 'eliminar')).toBe(false);
    redis.cadenas.set(`roles-usuario:${USUARIO}`, '{no es json');
    expect((await estado(guard.canActivate(contexto(token, Controlador, 'leer').ctx))).status).toBe(200);
  });

  it('una ruta sin roles declarados solo exige sesión', async () => {
    expect((await estado(guard.canActivate(contexto(await firmar(['Cliente']), Abierto, 'leer').ctx))).status).toBe(200);
  });

  it('el contrato de permisos clasifica roles, módulos, acciones y métodos', () => {
    expect(esRolDelSistema('Administrador')).toBe(true);
    expect(esRolDelSistema('Supervisor')).toBe(false);
    expect(esModuloPermiso('parqueaderos')).toBe(true);
    expect(esModuloPermiso('pagos')).toBe(false);
    expect(esModuloPermiso('toString')).toBe(false);
    expect(esAccionPermiso('eliminar')).toBe(true);
    expect(esAccionPermiso('borrar')).toBe(false);
    expect(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].map(accionDeMetodo)).toEqual([
      'leer', 'leer', 'crear', 'actualizar', 'actualizar', 'eliminar',
    ]);
    expect(tienePermiso({ method: 'GET' } as PeticionConSesion, 'eventos')).toBe(false);
  });
});
