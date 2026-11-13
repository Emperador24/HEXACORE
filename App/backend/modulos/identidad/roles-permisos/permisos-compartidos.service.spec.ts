import { ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { ConfiguracionServicio } from '../comun/config/configuracion';
import { PermisosCompartidos } from './permisos-compartidos.service';
import {
  CatalogoDto,
  DetalleRolDto,
  ListaRolesDto,
  MisPermisosDto,
  PermisoRespuestaDto,
  RolDto,
  UsuarioDeRolDto,
  AuditoriaRolDto,
} from './dto/roles-permisos.dto';

/**
 * La publicación en Redis de CU-028 con un Redis en memoria: lo que interesa
 * es qué claves quedan y que un Redis caído deshaga el cambio con un 503.
 */
describe('PermisosCompartidos (CU-028)', () => {
  class RedisFalso {
    conjuntos = new Map<string, Set<string>>();
    cadenas = new Map<string, { valor: string; px: number }>();
    fallar = false;
    escaneos = 0;
    multi() {
      const ops: (() => [Error | null, unknown])[] = [];
      const lote = {
        del: (k: string) => (ops.push(() => [null, (this.conjuntos.delete(k) || this.cadenas.delete(k)) ? 1 : 0]), lote),
        sadd: (k: string, ...m: string[]) => (ops.push(() => {
          const c = this.conjuntos.get(k) ?? new Set<string>();
          m.forEach((x) => c.add(x));
          this.conjuntos.set(k, c);
          return [null, m.length];
        }), lote),
        set: (k: string, v: string, _px: string, ms: number) => (ops.push(() => (this.cadenas.set(k, { valor: v, px: ms }), [null, 'OK'])), lote),
        exec: async () => {
          if (this.fallar) throw new Error('ECONNREFUSED');
          return ops.map((o) => o());
        },
      };
      return lote;
    }
    async scan(cursor: string) {
      this.escaneos++;
      const claves = [...this.conjuntos.keys()].filter((k) => k.startsWith('permisos-rol:'));
      // Dos páginas, para recorrer el bucle del cursor.
      return cursor === '0' ? ['7', claves.slice(0, 1)] : ['0', claves.slice(1)];
    }
  }

  const config = { seguridad: { sesionMinutos: 15 } } as ConfiguracionServicio;
  let redis: RedisFalso;
  let filas: { nombre: string; permisos: string[] }[];
  let servicio: PermisosCompartidos;

  beforeEach(() => {
    redis = new RedisFalso();
    filas = [];
    const datos = { query: jest.fn(async () => filas) } as unknown as DataSource;
    servicio = new PermisosCompartidos(redis as unknown as Redis, datos, config);
  });

  it('reemplaza la matriz de un rol y la borra si queda sin permisos', async () => {
    redis.conjuntos.set('permisos-rol:Supervisor', new Set(['reportes:leer']));
    await servicio.publicarMatriz('Supervisor', ['eventos:leer', 'parqueaderos:leer']);
    expect([...redis.conjuntos.get('permisos-rol:Supervisor')!].sort()).toEqual(['eventos:leer', 'parqueaderos:leer']);
    await servicio.publicarMatriz('Supervisor', []);
    expect(redis.conjuntos.has('permisos-rol:Supervisor')).toBe(false);
  });

  it('los roles vigentes viven lo que un token emitido antes del cambio, más el margen', async () => {
    await servicio.publicarRoles([]);
    expect(redis.cadenas.size).toBe(0);
    await servicio.publicarRoles([{ usuarioId: 'u1', roles: ['Cliente', 'Supervisor'] }]);
    expect(redis.cadenas.get('roles-usuario:u1')).toEqual({ valor: '["Cliente","Supervisor"]', px: 15 * 60_000 + 60_000 });
  });

  it('con Redis caído responde 503 para que la transacción del cambio se deshaga', async () => {
    redis.fallar = true;
    await expect(servicio.publicarMatriz('Supervisor', ['eventos:leer'])).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(servicio.publicarRoles([{ usuarioId: 'u1', roles: ['Cliente'] }])).rejects.toMatchObject({
      response: { codigo: 'PERMISOS_NO_DISPONIBLES' },
    });
  });

  it('un lote con un error dentro también es un fallo', async () => {
    const original = redis.multi.bind(redis);
    redis.multi = () => ({ ...original(), del: () => ({ exec: async () => [[new Error('READONLY'), null]] }) }) as never;
    await expect(servicio.publicarMatriz('Supervisor', [])).rejects.toBeInstanceOf(ServiceUnavailableException);
    redis.multi = () => ({ ...original(), del: () => ({ exec: async () => null }) }) as never;
    await expect(servicio.publicarMatriz('Supervisor', [])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('al arrancar rehace las matrices desde la base y borra las de roles que ya no existen', async () => {
    redis.conjuntos.set('permisos-rol:Eliminado', new Set(['eventos:leer']));
    redis.conjuntos.set('permisos-rol:Supervisor', new Set(['viejo:leer']));
    filas = [
      { nombre: 'Supervisor', permisos: ['parqueaderos:leer'] },
      { nombre: 'Vacío', permisos: [] },
    ];
    await servicio.onApplicationBootstrap();
    expect(redis.escaneos).toBe(2);
    expect(redis.conjuntos.has('permisos-rol:Eliminado')).toBe(false);
    expect([...redis.conjuntos.get('permisos-rol:Supervisor')!]).toEqual(['parqueaderos:leer']);
    expect(redis.conjuntos.has('permisos-rol:Vacío')).toBe(false);
  });

  it('si Redis no está al arrancar, avisa y deja arrancar el Núcleo', async () => {
    redis.scan = async () => { throw new Error('ECONNREFUSED'); };
    await expect(servicio.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('las respuestas documentadas en OpenAPI se construyen con sus campos', () => {
    const rol = Object.assign(new RolDto(), { id: 'r', nombre: 'Supervisor', permisos: [Object.assign(new PermisoRespuestaDto(), { modulo: 'eventos', accion: 'leer' })] });
    const detalle = Object.assign(new DetalleRolDto(), rol, {
      asignados: [Object.assign(new UsuarioDeRolDto(), { id: 'u' })],
      auditoria: [Object.assign(new AuditoriaRolDto(), { accion: 'CREAR' })],
    });
    const lista = Object.assign(new ListaRolesDto(), { roles: [rol], catalogo: Object.assign(new CatalogoDto(), { acciones: ['leer'] }) });
    const mios = Object.assign(new MisPermisosDto(), { roles: ['Supervisor'], permisos: rol.permisos });
    expect(detalle.asignados[0].id).toBe('u');
    expect(lista.roles[0].permisos[0].modulo).toBe('eventos');
    expect(mios.roles).toEqual(['Supervisor']);
  });
});
