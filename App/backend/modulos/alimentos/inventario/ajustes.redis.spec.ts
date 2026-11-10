import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { AJUSTAR_LUA } from './ajustes.scripts';
import { clavesReserva, ReservasService } from './reservas.service';

const url = process.env.REDIS_INVENTARIO_PRUEBAS_URL;
const suite = url ? describe : describe.skip;
suite('CU-012 Lua con Redis real: ajustes sin reconstrucción', () => {
  let redis: Redis; let local: string; let producto: string;
  const claves = new Set<string>();
  beforeAll(async () => { redis = new Redis(url!, { lazyConnect: true, maxRetriesPerRequest: 0 }); await redis.connect(); });
  beforeEach(() => { local = randomUUID(); producto = randomUUID(); });
  afterAll(async () => { if (claves.size) await redis.del(...claves); await redis.quit(); });
  async function ajustar(delta: number, tipo = 'AJUSTE', inicializa = false, id: string = randomUUID(), huella: string = id) {
    const [stock,,,marca] = clavesReserva(local, ''); const op = `pedidos:inv:{inventario}:ajuste:${id}`;
    [stock,marca,op].forEach(k => claves.add(k));
    return JSON.parse(String(await redis.eval(AJUSTAR_LUA, 3, stock, marca, op, huella, producto, String(delta), tipo, inicializa ? '1' : '0')));
  }
  it('el primer producto prepara solo su contador y repetir la operación no suma otra vez', async () => {
    const id = randomUUID();
    expect(await ajustar(10, 'ALTA', true, id)).toMatchObject({ estado: 'APLICADA', antes: 0, despues: 10 });
    expect(await ajustar(10, 'ALTA', true, id)).toMatchObject({ estado: 'APLICADA', antes: 0, despues: 10 });
    expect(await redis.hget(clavesReserva(local, '')[0], producto)).toBe('10');
    expect(await ajustar(10, 'ALTA', true, id, 'incompatible')).toMatchObject({ estado: 'PENDIENTE', codigo: 'OPERACION_INCOMPATIBLE' });
  });
  it('añade otro producto con reservas sin alterar los contadores existentes', async () => {
    await ajustar(10, 'ALTA', true);
    const original = producto, pedido = randomUUID();
    const reserva = new ReservasService(redis);
    await reserva.reservar({ establecimientoId: local, pedidoId: pedido, productos: [{ productoId: producto, cantidad: 4 }], expiraEn: new Date(Date.now()+60000) });
    claves.add(clavesReserva(local,pedido)[1]);
    producto = randomUUID(); await ajustar(6, 'ALTA');
    expect(await redis.hget(clavesReserva(local,'')[0],original)).toBe('6');
    expect(await redis.hget(clavesReserva(local,'')[0],producto)).toBe('6');
    await reserva.liberar(local,pedido);
  });
  it('reducción insegura es rechazo durable incluso si después aumentan las existencias', async () => {
    await ajustar(3, 'ALTA', true); const id = randomUUID();
    expect(await ajustar(-4,'AJUSTE',false,id)).toMatchObject({ estado:'RECHAZADA', antes:3, despues:3 });
    await ajustar(10);
    expect(await ajustar(-4,'AJUSTE',false,id)).toMatchObject({ estado:'RECHAZADA', antes:3, despues:3 });
    expect(await redis.hget(clavesReserva(local,'')[0],producto)).toBe('13');
  });
  it('los ajustes concurrentes no retiran más de lo disponible', async () => {
    await ajustar(10,'ALTA',true);
    const r=await Promise.all([ajustar(-7),ajustar(-7)]);
    expect(r.map(x=>x.estado).sort()).toEqual(['APLICADA','RECHAZADA']);
    expect(await redis.hget(clavesReserva(local,'')[0],producto)).toBe('3');
  });
  it('no reconstruye un establecimiento sin marca ni pisa un campo existente', async () => {
    expect(await ajustar(5,'ALTA')).toMatchObject({ estado:'PENDIENTE', codigo:'INVENTARIO_NO_PREPARADO' });
    await ajustar(5,'ALTA',true);
    expect(await ajustar(5,'ALTA')).toMatchObject({ estado:'PENDIENTE', codigo:'INVENTARIO_INCONSISTENTE' });
    expect(await redis.hget(clavesReserva(local,'')[0],producto)).toBe('5');
  });
  it('desborde y tipos ajenos no aplican un cambio parcial', async () => {
    await ajustar(2147483647,'ALTA',true);
    expect(await ajustar(1)).toMatchObject({ estado:'RECHAZADA' });
    expect(await redis.hget(clavesReserva(local,'')[0],producto)).toBe('2147483647');
  });
});
