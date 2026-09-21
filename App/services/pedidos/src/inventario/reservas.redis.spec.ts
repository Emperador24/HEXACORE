import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { clavesReserva, ReservasService, SolicitudReserva } from './reservas.service';

// Opt-in: usar un Redis efímero dedicado. No hay FLUSHDB ni acceso a la configuración de desarrollo.
const url = process.env.REDIS_INVENTARIO_PRUEBAS_URL;
const suiteRedis = url ? describe : describe.skip;
suiteRedis('Reservas Lua con Redis real', () => {
  let redis: Redis;
  let servicio: ReservasService;
  let establecimientoId: string;
  let p1: string;
  let p2: string;
  let datos: SolicitudReserva;
  const creadas: SolicitudReserva[] = [];
  const stocks = new Set<string>();
  beforeAll(async () => {
    redis = new Redis(url!, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, connectTimeout: 2000, commandTimeout: 2000 });
    redis.on('error', () => undefined);
    await redis.connect();
    servicio = new ReservasService(redis);
  });
  beforeEach(async () => {
    establecimientoId = randomUUID(); p1 = randomUUID(); p2 = randomUUID();
    datos = { establecimientoId, pedidoId: randomUUID(), expiraEn: new Date(Date.now() + 60000), productos: [{ productoId: p1, cantidad: 2 }, { productoId: p2, cantidad: 3 }] };
    creadas.push(datos);
    const [stock] = clavesReserva(establecimientoId, datos.pedidoId);
    stocks.add(stock);
    await redis.hset(stock, p1, 5, p2, 8);
  });
  afterAll(async () => {
    if (!redis) return;
    try {
      if (redis.status === 'ready') {
        for (const solicitud of creadas) {
          const [, reserva, vencimientos] = clavesReserva(solicitud.establecimientoId, solicitud.pedidoId);
          await redis.del(reserva);
          await redis.zrem(vencimientos, solicitud.pedidoId);
        }
        for (const stock of stocks) await redis.del(stock);
      }
    } finally { redis.disconnect(); }
  });
  const stockActual = () => redis.hmget(clavesReserva(establecimientoId, datos.pedidoId)[0], p1, p2);
  it('reserva varias cantidades, registra vencimiento y no pone TTL', async () => {
    expect((await servicio.reservar(datos)).estado).toBe('ACTIVA');
    expect(await stockActual()).toEqual(['3', '5']);
    const claves = clavesReserva(establecimientoId, datos.pedidoId);
    expect(await redis.zscore(claves[2], datos.pedidoId)).toBe(String(datos.expiraEn.getTime()));
    for (const clave of claves) expect(await redis.pttl(clave)).toBe(-1);
  });
  it('repetir en otro orden no descuenta otra vez ni renueva vencimiento', async () => {
    await servicio.reservar(datos);
    const resultado = await servicio.reservar({ ...datos, expiraEn: new Date(datos.expiraEn.getTime() + 60000), productos: [...datos.productos].reverse() });
    expect(resultado).toEqual({ estado: 'ACTIVA', expiraEn: datos.expiraEn, repetida: true });
    expect(await stockActual()).toEqual(['3', '5']);
  });
  it('no permite cambiar cantidades ni establecimiento para el mismo pedido', async () => {
    await servicio.reservar(datos);
    await expect(servicio.reservar({ ...datos, productos: [{ productoId: p1, cantidad: 1 }] })).rejects.toMatchObject({ status: 409 });
    await expect(servicio.reservar({ ...datos, establecimientoId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(await stockActual()).toEqual(['3', '5']);
  });
  it('stock insuficiente no descuenta ninguno ni crea reserva', async () => {
    await expect(servicio.reservar({ ...datos, productos: [{ productoId: p1, cantidad: 2 }, { productoId: p2, cantidad: 9 }] })).rejects.toMatchObject({ status: 409 });
    expect(await stockActual()).toEqual(['5', '8']);
    expect(await redis.exists(clavesReserva(establecimientoId, datos.pedidoId)[1])).toBe(0);
  });
  it('un producto sin inicializar no se trata como disponible', async () => {
    await redis.hdel(clavesReserva(establecimientoId, datos.pedidoId)[0], p2);
    await expect(servicio.reservar(datos)).rejects.toMatchObject({ response: { codigo: 'INVENTARIO_NO_PREPARADO' } });
    expect(await stockActual()).toEqual(['5', null]);
  });
  it('dos pedidos simultáneos no reservan la misma última unidad', async () => {
    await redis.hset(clavesReserva(establecimientoId, datos.pedidoId)[0], p1, 1);
    datos.productos = [{ productoId: p1, cantidad: 1 }];
    const otro = { ...datos, pedidoId: randomUUID() }; creadas.push(otro);
    const resultados = await Promise.allSettled([servicio.reservar(datos), servicio.reservar(otro)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await stockActual())[0]).toBe('0');
  });
  it('la liberación concurrente devuelve cantidades exactamente una vez', async () => {
    await servicio.reservar(datos);
    const resultados = await Promise.all([servicio.liberar(establecimientoId, datos.pedidoId), servicio.liberar(establecimientoId, datos.pedidoId)]);
    expect(resultados.filter((r) => !r.repetida)).toHaveLength(1);
    expect(await stockActual()).toEqual(['5', '8']);
    expect(await redis.zscore(clavesReserva(establecimientoId, datos.pedidoId)[2], datos.pedidoId)).toBeNull();
    expect((await servicio.reservar(datos)).estado).toBe('LIBERADA');
    expect(await stockActual()).toEqual(['5', '8']);
    await expect(servicio.consumir(establecimientoId, datos.pedidoId)).rejects.toMatchObject({ status: 409 });
  });
  it('consumir no devuelve unidades y no permite liberación posterior', async () => {
    await servicio.reservar(datos);
    expect((await servicio.consumir(establecimientoId, datos.pedidoId)).estado).toBe('CONSUMIDA');
    expect((await servicio.consumir(establecimientoId, datos.pedidoId)).repetida).toBe(true);
    await expect(servicio.liberar(establecimientoId, datos.pedidoId)).rejects.toMatchObject({ status: 409 });
    expect(await stockActual()).toEqual(['3', '5']);
    expect((await servicio.reservar(datos)).estado).toBe('CONSUMIDA');
  });
  it('liberar o consumir inexistente no crea contadores ni reserva', async () => {
    await expect(servicio.liberar(establecimientoId, datos.pedidoId)).rejects.toMatchObject({ status: 404 });
    await expect(servicio.consumir(establecimientoId, datos.pedidoId)).rejects.toMatchObject({ status: 404 });
    expect(await stockActual()).toEqual(['5', '8']);
  });
  it('vencimiento lógico no libera mágicamente: requiere operación explícita', async () => {
    datos.expiraEn = new Date(Date.now() + 100);
    await servicio.reservar(datos);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await stockActual()).toEqual(['3', '5']);
    expect(await redis.exists(clavesReserva(establecimientoId, datos.pedidoId)[1])).toBe(1);
    expect((await servicio.reservar(datos)).repetida).toBe(true);
    await servicio.liberar(establecimientoId, datos.pedidoId);
    expect(await stockActual()).toEqual(['5', '8']);
  });
  it('una reserva nueva ya vencida se rechaza sin mutar stock', async () => {
    await expect(servicio.reservar({ ...datos, expiraEn: new Date(1) })).rejects.toMatchObject({ response: { codigo: 'VENCIMIENTO_INVALIDO' } });
    expect(await stockActual()).toEqual(['5', '8']);
  });
  it.each(['01', '1.5', '1e2', '-1', '2147483648'])('contador corrupto %s no provoca escrituras parciales', async (valor) => {
    const orden = [p1, p2].sort();
    const [stock, reserva] = clavesReserva(establecimientoId, datos.pedidoId);
    await redis.hset(stock, orden[1], valor);
    const antes = await redis.hgetall(stock);
    await expect(servicio.reservar(datos)).rejects.toMatchObject({ status: 503 });
    expect(await redis.hgetall(stock)).toEqual(antes);
    expect(await redis.exists(reserva)).toBe(0);
  });
  it('liberar valida todos los contadores antes de restituir cualquiera', async () => {
    await servicio.reservar(datos);
    const [stock, reserva] = clavesReserva(establecimientoId, datos.pedidoId);
    await redis.hset(stock, [p1, p2].sort()[1], '2147483647');
    const antes = await redis.hgetall(stock);
    await expect(servicio.liberar(establecimientoId, datos.pedidoId)).rejects.toMatchObject({ status: 503 });
    expect(await redis.hgetall(stock)).toEqual(antes);
    expect(await redis.hget(reserva, 'estado')).toBe('ACTIVA');
  });
});
