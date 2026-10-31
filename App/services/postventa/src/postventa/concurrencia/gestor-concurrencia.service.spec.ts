import Redis from 'ioredis';
import { ConfiguracionServicio } from '../../config/configuracion';
import { GestorConcurrencia } from './gestor-concurrencia.service';

/**
 * El bloqueo del checkout es la primera línea de defensa de **RNF-01** (*"0 %
 * de ventas duplicadas"*). Estas pruebas fijan los detalles que lo hacen
 * correcto y que son fáciles de romper sin darse cuenta:
 *
 * - que el `SET` use `NX` (solo si no existe) y `PX` (con caducidad);
 * - que liberar compare el testigo **dentro de Redis**, con Lua, y no con un
 *   `GET` seguido de un `DEL` — entre esos dos comandos cabe una carrera que
 *   liberaría el bloqueo de otra persona.
 *
 * Redis se sustituye por un doble, que es lo que RNF-18 pide de las
 * dependencias externas. El comportamiento contra un Redis real está probado en
 * `pruebas/rnf01-concurrencia.py`, con 50 compradores simultáneos.
 */
describe('GestorConcurrencia', () => {
  const config = {
    reventa: { bloqueoTtlSegundos: 120, topePrecioFactor: 1.5, comisionPorcentaje: 10, margenCierreMinutos: 0 },
  } as ConfiguracionServicio;

  const PUBLICACION = '30000000-0000-4000-8000-000000000001';
  const CLAVE = `reventa:bloqueo:publicacion:${PUBLICACION}`;

  let redis: { set: jest.Mock; get: jest.Mock; eval: jest.Mock; pttl: jest.Mock; ping: jest.Mock; quit: jest.Mock };
  let gestor: GestorConcurrencia;

  beforeEach(() => {
    redis = {
      set: jest.fn(),
      get: jest.fn(),
      eval: jest.fn(),
      pttl: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    gestor = new GestorConcurrencia(redis as unknown as Redis, config);
  });

  describe('bloquear', () => {
    it('adquiere el bloqueo con NX y el TTL configurado', async () => {
      redis.set.mockResolvedValue('OK');

      const resultado = await gestor.bloquear(PUBLICACION, 'txn-1');

      expect(resultado).toEqual({ adquirido: true, titularActual: 'txn-1' });
      // `NX` es lo que hace que solo uno gane; `PX` lo que evita que un proceso
      // muerto deje la publicación bloqueada para siempre.
      expect(redis.set).toHaveBeenCalledWith(CLAVE, 'txn-1', 'PX', 120_000, 'NX');
    });

    it('no lo adquiere si ya lo tiene otro, y dice quién', async () => {
      // Camino CU-006H: el segundo comprador debe enterarse "de inmediato",
      // como pide ASR-01, en vez de quedarse esperando turno.
      redis.set.mockResolvedValue(null);
      redis.get.mockResolvedValue('txn-de-otro');

      const resultado = await gestor.bloquear(PUBLICACION, 'txn-2');

      expect(resultado).toEqual({ adquirido: false, titularActual: 'txn-de-otro' });
    });

    it('informa de que no hay titular si el bloqueo caducó entre medias', async () => {
      redis.set.mockResolvedValue(null);
      redis.get.mockResolvedValue(null);

      const resultado = await gestor.bloquear(PUBLICACION, 'txn-2');

      expect(resultado).toEqual({ adquirido: false, titularActual: null });
    });

    it('usa un espacio de nombres propio, para no chocar con el aforo ni las sesiones', async () => {
      redis.set.mockResolvedValue('OK');

      await gestor.bloquear(PUBLICACION, 'txn-1');

      // ADR-03 usa Redis también para aforo, ocupación y sesiones.
      expect(redis.set.mock.calls[0][0]).toMatch(/^reventa:bloqueo:publicacion:/);
    });
  });

  describe('liberar', () => {
    it('compara y borra de forma atómica, con el testigo como argumento', async () => {
      redis.eval.mockResolvedValue(1);

      await expect(gestor.liberar(PUBLICACION, 'txn-1')).resolves.toBe(true);

      const [guion, numeroClaves, clave, testigo] = redis.eval.mock.calls[0] as [string, number, string, string];
      // Si esto dejara de ser Lua y pasara a ser GET + DEL, un bloqueo caducado
      // y retomado por otra persona podría liberarse por error.
      expect(guion).toContain("redis.call('get', KEYS[1])");
      expect(guion).toContain("redis.call('del', KEYS[1])");
      expect(numeroClaves).toBe(1);
      expect(clave).toBe(CLAVE);
      expect(testigo).toBe('txn-1');
    });

    it('no libera un bloqueo ajeno', async () => {
      redis.eval.mockResolvedValue(0);

      await expect(gestor.liberar(PUBLICACION, 'txn-de-otro')).resolves.toBe(false);
    });
  });

  describe('renovar', () => {
    it('extiende el TTL solo si el bloqueo sigue siendo nuestro', async () => {
      redis.eval.mockResolvedValue(1);

      await expect(gestor.renovar(PUBLICACION, 'txn-1')).resolves.toBe(true);

      const [guion, , , , ttl] = redis.eval.mock.calls[0] as [string, number, string, string, string];
      expect(guion).toContain('pexpire');
      expect(ttl).toBe('120000');
    });

    it('devuelve false si el bloqueo ya es de otro', async () => {
      redis.eval.mockResolvedValue(0);

      await expect(gestor.renovar(PUBLICACION, 'txn-1')).resolves.toBe(false);
    });
  });

  describe('tiempoRestanteMs', () => {
    it('devuelve los milisegundos que quedan', async () => {
      redis.pttl.mockResolvedValue(45_000);

      await expect(gestor.tiempoRestanteMs(PUBLICACION)).resolves.toBe(45_000);
    });

    it.each([
      ['la clave no existe', -2],
      ['la clave no caduca', -1],
    ])('devuelve null cuando %s', async (_caso, valor) => {
      redis.pttl.mockResolvedValue(valor);

      await expect(gestor.tiempoRestanteMs(PUBLICACION)).resolves.toBeNull();
    });
  });

  describe('bloqueo de tareas', () => {
    it('usa un espacio de nombres distinto del de los checkouts', async () => {
      redis.set.mockResolvedValue('OK');

      const testigo = await gestor.bloquearTarea('expirar-publicaciones', 60_000);

      expect(testigo).not.toBeNull();
      expect(redis.set.mock.calls[0][0]).toBe('reventa:tarea:expirar-publicaciones');
    });

    it('devuelve null si otra réplica ya está ejecutando la tarea', async () => {
      redis.set.mockResolvedValue(null);

      await expect(gestor.bloquearTarea('expirar-publicaciones', 60_000)).resolves.toBeNull();
    });
  });

  describe('sonda', () => {
    it('responde true si Redis contesta al ping', async () => {
      redis.ping.mockResolvedValue('PONG');

      await expect(gestor.responde()).resolves.toBe(true);
    });

    it('responde false, sin lanzar, si Redis no está', async () => {
      // La sonda de vida llama a esto: si propagara la excepción, el endpoint
      // de salud devolvería 500 en vez del 503 que saca la instancia de
      // rotación.
      redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(gestor.responde()).resolves.toBe(false);
    });
  });

  it('cierra la conexión al apagarse el servicio', async () => {
    // Cierre ordenado: RNF-15 pide desplegar sin solicitudes fallidas.
    await gestor.onModuleDestroy();

    expect(redis.quit).toHaveBeenCalled();
  });
});
