import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PREPARAR_INVENTARIO_LUA } from './preparacion.scripts';
import { clavesReserva, ReservasService } from './reservas.service';

const url = process.env.REDIS_INVENTARIO_PRUEBAS_URL;
const suiteRedis = url ? describe : describe.skip;
suiteRedis('Preparación Lua en Redis real (efímero)', () => {
  let redis: Redis;
  let establecimientoId: string;
  let pedidoId: string;
  let productoId: string;
  let agotadoId: string;
  let stock: string;
  let reserva: string;
  let marca: string;
  let vencimientos: string;
  beforeAll(async () => {
    redis = new Redis(url!, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, connectTimeout: 2000, commandTimeout: 2000 });
    redis.on('error', () => undefined);
    await redis.connect();
  });
  beforeEach(() => {
    establecimientoId = randomUUID(); pedidoId = randomUUID(); productoId = randomUUID(); agotadoId = randomUUID();
    [stock, reserva, vencimientos, marca] = clavesReserva(establecimientoId, pedidoId);
  });
  afterEach(async () => {
    await redis.del(stock, reserva, marca);
    await redis.zrem(vencimientos, pedidoId);
  });
  afterAll(() => redis?.disconnect());
  const preparar = async (filas = [{ productoId, cantidadInventario: 20 }, { productoId: agotadoId, cantidadInventario: 0 }]) => {
    return JSON.parse(String(await redis.eval(PREPARAR_INVENTARIO_LUA, 3, stock, marca, vencimientos, establecimientoId, JSON.stringify(filas))));
  };
  it('crea hash completo, incluye cero y marca persistente', async () => {
    expect(await preparar()).toEqual({ codigo: 'OK' });
    expect(await redis.hgetall(stock)).toEqual({ [productoId]: '20', [agotadoId]: '0' });
    expect(await redis.get(marca)).toBe('1');
    expect(await redis.pttl(stock)).toBe(-1);
    expect(await redis.pttl(marca)).toBe(-1);
  });
  it('preparar dos veces no sobrescribe', async () => {
    await preparar();
    expect(await preparar([{ productoId, cantidadInventario: 999 }])).toEqual({ codigo: 'INVENTARIO_YA_EXISTENTE' });
    expect(await redis.hgetall(stock)).toEqual({ [productoId]: '20', [agotadoId]: '0' });
  });
  it.each(['marca', 'hash parcial', 'stock de tipo incorrecto'])('rechaza %s existente sin completar ni sobrescribir', async (caso) => {
    if (caso === 'marca') await redis.set(marca, '1');
    if (caso === 'hash parcial') await redis.hset(stock, productoId, 3);
    if (caso === 'stock de tipo incorrecto') await redis.set(stock, 'dato previo');
    expect(await preparar()).toEqual({ codigo: 'INVENTARIO_YA_EXISTENTE' });
    if (caso === 'marca') expect(await redis.exists(stock)).toBe(0);
    if (caso === 'hash parcial') {
      expect(await redis.hgetall(stock)).toEqual({ [productoId]: '3' });
      expect(await redis.exists(marca)).toBe(0);
    }
    if (caso === 'stock de tipo incorrecto') expect(await redis.get(stock)).toBe('dato previo');
  });
  it.each(['ACTIVA', 'CONSUMIDA', 'LIBERADA'])('rechaza reservas residuales %s aun sin stock, marca o índice', async (estado) => {
    await redis.hset(reserva, 'establecimientoId', establecimientoId, 'estado', estado);
    expect(await preparar()).toEqual({ codigo: 'INVENTARIO_YA_EXISTENTE' });
    expect(await redis.exists(stock, marca)).toBe(0);
  });
  it('rechaza índice huérfano sin inventar a qué establecimiento pertenece', async () => {
    await redis.zadd(vencimientos, Date.now(), pedidoId);
    expect(await preparar()).toEqual({ codigo: 'DATOS_INCONSISTENTES' });
    expect(await redis.exists(stock, marca)).toBe(0);
  });
  it('no sobrescribe el efecto de una reserva activa', async () => {
    await preparar();
    await new ReservasService(redis).reservar({ pedidoId, establecimientoId, expiraEn: new Date(Date.now() + 60000), productos: [{ productoId, cantidad: 5 }] });
    expect(await preparar()).toEqual({ codigo: 'INVENTARIO_YA_EXISTENTE' });
    expect(await redis.hget(stock, productoId)).toBe('15');
  });
  it('dos preparaciones simultáneas solo inicializan una vez', async () => {
    const resultados = await Promise.all([preparar(), preparar()]);
    expect(resultados.filter((r) => r.codigo === 'OK')).toHaveLength(1);
    expect(resultados.filter((r) => r.codigo === 'INVENTARIO_YA_EXISTENTE')).toHaveLength(1);
  });
  it('valida todos los productos antes de escribir', async () => {
    expect(await preparar([{ productoId, cantidadInventario: 5 }, { productoId: agotadoId, cantidadInventario: -1 }])).toEqual({ codigo: 'PRODUCTOS_INVALIDOS' });
    expect(await redis.exists(stock, marca)).toBe(0);
  });
  it('una reserva de otro establecimiento no impide preparar este', async () => {
    await redis.hset(reserva, 'establecimientoId', randomUUID(), 'estado', 'ACTIVA');
    expect(await preparar()).toEqual({ codigo: 'OK' });
  });
});
