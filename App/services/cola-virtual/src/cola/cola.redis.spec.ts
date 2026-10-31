import Redis from 'ioredis';
import { ColaService } from './cola.service';
import { EstadoTurno } from './dto/cola.dto';

/**
 * La lógica de la fila vive en Lua, así que probarla con un doble de Redis no
 * probaría nada: se ejecuta contra un Redis de verdad.
 *
 * Se salta si no hay uno a mano (`cd App/infra && ./iniciar.sh --rol datos`).
 */
const URL = { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PUERTO ?? 6380) };

let redis: Redis;
let hayRedis = false;

beforeAll(async () => {
  redis = new Redis({ ...URL, lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    await redis.connect();
    hayRedis = (await redis.ping()) === 'PONG';
  } catch {
    hayRedis = false;
  }
});

afterAll(async () => {
  if (redis) redis.disconnect();
});

function servicio(aforo: number, turnoTtlSegundos = 300, esperaTtlSegundos = 60) {
  const config = {
    cola: { aforoConcurrente: aforo, turnoTtlSegundos, reintentoSegundos: 5, esperaTtlSegundos },
  } as never;
  return new ColaService(config, redis);
}

const EVENTO = 'e0000001-0000-4000-8000-000000000001';

async function limpiar() {
  const claves = await redis.keys(`cola:${EVENTO}:*`);
  if (claves.length) await redis.del(...claves);
}

describe('ColaService contra Redis', () => {
  beforeEach(async () => {
    if (!hayRedis) return;
    await limpiar();
  });

  it('con sitio libre, admite y entrega token', async () => {
    if (!hayRedis) return;
    const turno = await servicio(2).pedirTurno(EVENTO, 'ana');

    expect(turno.estado).toBe(EstadoTurno.ADMITIDO);
    expect(turno.token).toEqual(expect.any(String));
    expect(turno.posicion).toBeNull();
  });

  it('el aforo se respeta: el que sobra espera, y con su puesto', async () => {
    if (!hayRedis) return;
    const cola = servicio(2);

    expect((await cola.pedirTurno(EVENTO, 'ana')).estado).toBe(EstadoTurno.ADMITIDO);
    expect((await cola.pedirTurno(EVENTO, 'bruno')).estado).toBe(EstadoTurno.ADMITIDO);

    const tercero = await cola.pedirTurno(EVENTO, 'carla');
    expect(tercero.estado).toBe(EstadoTurno.EN_ESPERA);
    expect(tercero.posicion).toBe(1);
    expect(tercero.token).toBeNull();
  });

  it('pedir turno dos veces NO da dos sitios', async () => {
    if (!hayRedis) return;
    const cola = servicio(2);

    const primera = await cola.pedirTurno(EVENTO, 'ana');
    const segunda = await cola.pedirTurno(EVENTO, 'ana');

    expect(segunda.estado).toBe(EstadoTurno.ADMITIDO);
    expect(segunda.token).toBe(primera.token);
    // Lo que importa: sigue habiendo un hueco libre, no cero.
    expect((await cola.estado(EVENTO)).comprando).toBe(1);
  });

  it('volver a preguntar no manda al final de la fila', async () => {
    if (!hayRedis) return;
    const cola = servicio(1);
    await cola.pedirTurno(EVENTO, 'ana');
    await cola.pedirTurno(EVENTO, 'bruno');
    await cola.pedirTurno(EVENTO, 'carla');

    // Bruno llegó antes que Carla y sigue primero aunque vuelva a preguntar.
    expect((await cola.pedirTurno(EVENTO, 'bruno')).posicion).toBe(1);
    expect((await cola.pedirTurno(EVENTO, 'carla')).posicion).toBe(2);
  });

  it('el turno es de un solo uso', async () => {
    if (!hayRedis) return;
    const cola = servicio(2);
    const turno = await cola.pedirTurno(EVENTO, 'ana');

    expect(await cola.consumirTurno(EVENTO, turno.token as string)).toBe(true);
    // Segundo intento con el mismo token: no vale. Sin esto, un token filtrado
    // serviría para colarse tantas veces como quisiera.
    expect(await cola.consumirTurno(EVENTO, turno.token as string)).toBe(false);
  });

  it('gastar un turno libera el sitio para quien esperaba', async () => {
    if (!hayRedis) return;
    const cola = servicio(1);
    const ana = await cola.pedirTurno(EVENTO, 'ana');
    expect((await cola.pedirTurno(EVENTO, 'bruno')).estado).toBe(EstadoTurno.EN_ESPERA);

    await cola.consumirTurno(EVENTO, ana.token as string);

    expect((await cola.pedirTurno(EVENTO, 'bruno')).estado).toBe(EstadoTurno.ADMITIDO);
  });

  it('un turno caducado deja de ocupar sitio', async () => {
    if (!hayRedis) return;
    // 1 segundo de vida: suficiente para verlo caducar sin alargar la prueba.
    const cola = servicio(1, 1);
    await cola.pedirTurno(EVENTO, 'ana');
    expect((await cola.pedirTurno(EVENTO, 'bruno')).estado).toBe(EstadoTurno.EN_ESPERA);

    await new Promise((r) => setTimeout(r, 1100));

    expect((await cola.pedirTurno(EVENTO, 'bruno')).estado).toBe(EstadoTurno.ADMITIDO);
  });

  it('con solo el token, el turno se gasta una vez y solo su dueño', async () => {
    if (!hayRedis) return;
    const cola = servicio(2);
    const turno = await cola.pedirTurno(EVENTO, 'ana');
    const token = turno.token as string;

    // Un token ajeno no sirve aunque esté vivo: el gateway reenvía la sesión
    // de quien compra, y el turno tiene que ser suyo.
    expect(await cola.consumirTurnoDe(token, 'bruno')).toBeNull();
    expect(await cola.consumirTurnoDe(token, 'ana')).toBe(EVENTO);
    expect(await cola.consumirTurnoDe(token, 'ana')).toBeNull();
  });

  it('un token inventado no sirve', async () => {
    if (!hayRedis) return;
    expect(await servicio(2).consumirTurno(EVENTO, 'no-existe')).toBe(false);
  });

  it('bajo carga, nunca entran más que el aforo', async () => {
    if (!hayRedis) return;
    const cola = servicio(10);

    // 50 a la vez contra un aforo de 10: es el pico que la cola existe para
    // contener, y el guion Lua es lo que impide que dos instancias admitan de
    // más leyendo el mismo conteo.
    const turnos = await Promise.all(
      Array.from({ length: 50 }, (_, i) => cola.pedirTurno(EVENTO, `comprador-${i}`)),
    );

    const admitidos = turnos.filter((t) => t.estado === EstadoTurno.ADMITIDO);
    expect(admitidos).toHaveLength(10);
    expect(new Set(admitidos.map((t) => t.token)).size).toBe(10);
    expect((await cola.estado(EVENTO)).enEspera).toBe(40);
  });
});
