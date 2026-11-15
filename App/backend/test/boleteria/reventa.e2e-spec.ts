const { opcionesPg } = require('../base-unica/conexiones.cjs');
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
const procesos = require('./procesos.cjs');
const { Client } = require('pg');
const dias = (n: number) => new Date(Date.now() + n * 86400000);

/**
 * CU-006 · Mercado secundario, contra Boletería compilada. La suite de flujos
 * prueba la compra y el pago de una reventa; esta, el resto del caso de uso:
 * - las entradas propias (paso 1);
 * - las reglas al publicar (pasos 2-4);
 * - el mercado con sus filtros y orden (paso 5);
 * - editar y retirar una publicación;
 * - consultar y cancelar el checkout (CU-006C);
 * - el barrido manual (CU-006D).
 */
describe('CU-006 · Mercado secundario (e2e, Boletería)', () => {
  let app: any;
  const db: Record<string, any> = {};
  let redis: Redis;
  const evento = randomUUID(), localidad = randomUUID();
  const vendedor = randomUUID(), comprador = randomUUID(), otro = randomUUID(), administrador = randomUUID();
  const sesiones = new Map<string, { token: string; jti: string }>();
  function sesion(id: string, roles = ['Cliente']) {
    if (!sesiones.has(id)) {
      const jti = randomUUID();
      const token = new JwtService().sign({ sub: id, roles, jti }, { algorithm: 'RS256', issuer: 'hexacore-administracion',
        expiresIn: '15m', privateKey: readFileSync(resolve(__dirname, '../claves/jwt-privada.pem'), 'utf8') });
      sesiones.set(id, { token, jti });
    }
    return sesiones.get(id)!;
  }
  async function pedir(n: string, metodo: string, ruta: string, usuario?: string, cuerpo?: unknown) {
    const r = await fetch(`${app.urls[n]}/api/v1${ruta}`, { method: metodo,
      headers: { 'Content-Type': 'application/json', ...(usuario ? { Authorization: `Bearer ${sesion(usuario).token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(15000) });
    const texto = await r.text();
    return { status: r.status, body: texto ? JSON.parse(texto) : null };
  }
  const reventa = (metodo: string, ruta: string, usuario?: string, cuerpo?: unknown) => pedir('postventa', metodo, `/reventa${ruta}`, usuario, cuerpo);
  async function sql(n: string, consulta: string, valores: unknown[] = []) { return (await db[n].query(consulta, valores)).rows; }
  async function entradaComprada(usuario = vendedor): Promise<string> {
    const r = await pedir('ventas', 'POST', '/compras', usuario, { localidadId: localidad, cantidad: 1 });
    expect(r.status).toBe(201);
    const p = await pedir('ventas', 'POST', `/compras/${r.body.id}/pagar`, usuario, { metodoPago: 'TARJETA', token: 'tok_ok_reventa' });
    expect(p.status).toBe(200);
    return p.body.entradas[0].id;
  }

  beforeAll(async () => {
    app = await procesos.iniciar();
    redis = new Redis({ host: '127.0.0.1', port: 16384 });
    await procesos.esperar(() => redis.status === 'ready');
    for (const n of ['ventas', 'catalogo', 'acceso-qr', 'postventa']) {
      db[n] = new Client(opcionesPg(n)); await db[n].connect();
      const extra = n === 'postventa' ? ',permite_reventa' : `,estado${n === 'acceso-qr' ? ',aforo_maximo' : ',categoria'}`;
      const valor = n === 'postventa' ? ',true' : `,'PUBLICADO'${n === 'acceso-qr' ? ',100' : ",'Conciertos'"}`;
      await sql(n, `INSERT INTO eventos_referencia(evento_id,nombre,fecha_inicio,lugar,ciudad${extra}) VALUES($1,$2,$3,'Recinto Reventa','Bogotá'${valor})`,
        [evento, `Reventa ${evento.slice(0, 8)}`, dias(30)]);
      if (n === 'ventas' || n === 'catalogo') {
        await sql(n, `INSERT INTO localidades_evento(localidad_id,evento_id,nombre,precio,aforo) VALUES($1,$2,'General',100000,20)`, [localidad, evento]);
      }
    }
    sesion(administrador, ['Administrador']);
  });
  afterAll(async () => {
    try { if (app) await procesos.cerrar(app); }
    finally {
      if (redis) { for (const s of sesiones.values()) await redis.del(`sesion-revocada:${s.jti}`); redis.disconnect(); }
      for (const c of Object.values(db)) await c.end();
    }
  });

  it('paso 1: las entradas propias llegan con lo que se puede hacer con cada una', async () => {
    const entrada = await entradaComprada();
    const mias = await reventa('GET', '/mis-entradas', vendedor);
    expect(mias.status).toBe(200);
    expect(mias.body.find((e: { id: string }) => e.id === entrada)).toMatchObject({ puedePublicarse: true, precioMaximo: expect.any(Number) });
    expect((await reventa('GET', '/mis-entradas')).status).toBe(401);
  });

  it('pasos 2-4: tope de precio, propiedad, una sola publicación por entrada y política del evento', async () => {
    const entrada = await entradaComprada();
    expect((await reventa('POST', '/publicaciones', vendedor, { entradaId: entrada, precio: 999999 })).status).toBe(422);
    expect([403, 404]).toContain((await reventa('POST', '/publicaciones', otro, { entradaId: entrada, precio: 100000 })).status);
    const publicada = await reventa('POST', '/publicaciones', vendedor, { entradaId: entrada, precio: 105000 });
    expect(publicada.status).toBe(201);
    expect((await reventa('POST', '/publicaciones', vendedor, { entradaId: entrada, precio: 105000 })).status).toBe(409);
    // Paso 1 otra vez: la entrada ya no se puede publicar y trae su publicación.
    const mias = (await reventa('GET', '/mis-entradas', vendedor)).body;
    expect(mias.find((e: { id: string }) => e.id === entrada)).toMatchObject({
      puedePublicarse: false, publicacion: { id: publicada.body.id, precio: 105000 },
    });

    const otraEntrada = await entradaComprada();
    await sql('postventa', 'UPDATE eventos_referencia SET permite_reventa=false WHERE evento_id=$1', [evento]);
    try {
      expect((await reventa('POST', '/publicaciones', vendedor, { entradaId: otraEntrada, precio: 100000 })).status).toBe(409);
    } finally {
      await sql('postventa', 'UPDATE eventos_referencia SET permite_reventa=true WHERE evento_id=$1', [evento]);
    }
  });

  it('paso 5: el mercado filtra por evento, pagina, ordena y nunca muestra lo propio', async () => {
    const baratas = [];
    for (const precio of [90000, 110000]) {
      const p = await reventa('POST', '/publicaciones', vendedor, { entradaId: await entradaComprada(), precio });
      expect(p.status).toBe(201);
      baratas.push(p.body.id);
    }
    const ids = (r: { body: { publicaciones: { id: string }[] } }) => r.body.publicaciones.map((p) => p.id);
    for (const orden of ['recientes', 'precio_asc', 'precio_desc', 'evento_proximo']) {
      const r = await reventa('GET', `/publicaciones?eventoId=${evento}&orden=${orden}`, comprador);
      expect(r.status).toBe(200);
      expect(ids(r)).toEqual(expect.arrayContaining(baratas));
    }
    const asc = await reventa('GET', `/publicaciones?eventoId=${evento}&orden=precio_asc`, comprador);
    const precios = asc.body.publicaciones.map((p: { precio: number }) => p.precio);
    expect(precios).toEqual([...precios].sort((a, b) => a - b));
    const pagina = await reventa('GET', `/publicaciones?eventoId=${evento}&limite=1&desplazamiento=1`, comprador);
    expect(pagina.body.publicaciones).toHaveLength(1);
    expect((await reventa('GET', `/publicaciones?eventoId=${evento}`, vendedor)).body.publicaciones).toEqual([]);
    expect((await reventa('GET', '/publicaciones?limite=0', comprador)).status).toBe(400);

    const detalle = await reventa('GET', `/publicaciones/${baratas[0]}`, comprador);
    expect(detalle).toMatchObject({ status: 200, body: { id: baratas[0], esPropia: false, lugar: 'Recinto Reventa' } });
    expect((await reventa('GET', `/publicaciones/${baratas[0]}`, vendedor)).body.esPropia).toBe(true);
    expect((await reventa('GET', `/publicaciones/${randomUUID()}`, comprador)).status).toBe(404);
  });

  it('el vendedor cambia el precio dentro del tope; nadie más puede', async () => {
    const p = (await reventa('POST', '/publicaciones', vendedor, { entradaId: await entradaComprada(), precio: 100000 })).body;
    const cambio = await reventa('PATCH', `/publicaciones/${p.id}`, vendedor, { precio: 95000 });
    expect(cambio).toMatchObject({ status: 200, body: { precio: 95000 } });
    expect((await reventa('PATCH', `/publicaciones/${p.id}`, vendedor, { precio: 999999 })).status).toBe(422);
    expect((await reventa('PATCH', `/publicaciones/${p.id}`, otro, { precio: 90000 })).status).toBe(403);
    expect((await reventa('PATCH', `/publicaciones/${randomUUID()}`, vendedor, { precio: 90000 })).status).toBe(404);
  });

  it('CU-006C: el checkout se consulta, se reanuda, bloquea el retiro y al cancelarlo se libera', async () => {
    const p = (await reventa('POST', '/publicaciones', vendedor, { entradaId: await entradaComprada(), precio: 100000 })).body;
    expect((await reventa('POST', `/publicaciones/${p.id}/checkout`, vendedor)).status).toBe(409);
    const checkout = await reventa('POST', `/publicaciones/${p.id}/checkout`, comprador);
    expect(checkout.status).toBe(201);
    const otraVez = await reventa('POST', `/publicaciones/${p.id}/checkout`, comprador);
    expect(otraVez.body.id).toBe(checkout.body.id);

    const estado = await reventa('GET', `/checkout/${checkout.body.id}`, comprador);
    expect(estado.status).toBe(200);
    expect(estado.body.segundosRestantes).toBeGreaterThan(0);
    expect((await reventa('GET', `/checkout/${checkout.body.id}`, otro)).status).toBe(404);
    expect((await reventa('GET', `/checkout/${randomUUID()}`, comprador)).status).toBe(404);

    expect((await reventa('DELETE', `/publicaciones/${p.id}`, vendedor)).status).toBe(409);
    const cancelado = await reventa('DELETE', `/checkout/${checkout.body.id}`, comprador);
    expect(cancelado.status).toBe(200);
    expect((await reventa('POST', `/checkout/${checkout.body.id}/pagar`, comprador, { metodoPago: 'TARJETA', token: 'tok_ok_reventa' })).status).toBe(409);

    // Libre otra vez: el vendedor la retira y la entrada vuelve a estar disponible.
    const retirada = await reventa('DELETE', `/publicaciones/${p.id}`, vendedor);
    expect(retirada.status).toBe(200);
    expect((await reventa('DELETE', `/publicaciones/${p.id}`, vendedor)).status).toBe(409);
    expect((await reventa('POST', `/publicaciones/${p.id}/checkout`, otro)).status).toBe(409);
  });

  it('CU-006D: el barrido manual es solo para administradores y vence lo que pasó su fecha', async () => {
    const p = (await reventa('POST', '/publicaciones', vendedor, { entradaId: await entradaComprada(), precio: 100000 })).body;
    await sql('postventa', "UPDATE publicaciones_reventa SET fecha_expiracion=now()-interval '1 minute' WHERE id=$1", [p.id]);
    expect((await reventa('POST', '/mantenimiento/expirar-publicaciones', vendedor)).status).toBe(403);
    const barrido = await reventa('POST', '/mantenimiento/expirar-publicaciones', administrador);
    expect(barrido.status).toBe(200);
    await procesos.esperar(async () => (await sql('postventa', 'SELECT estado FROM publicaciones_reventa WHERE id=$1', [p.id]))[0].estado === 'EXPIRADA');
  });
});
