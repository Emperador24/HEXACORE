import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { NucleoPrueba } from '../logistica/nucleo-prueba';

/** PNG de 1×1 válido: la firma es lo que comprueba el servicio. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** CU-029 · Gestión de recintos y zonas, contra el Núcleo compilado. */
describe('CU-029 · Gestión de recintos y zonas (e2e)', () => {
  let nucleo: NucleoPrueba;
  let organizador: { id: string; token: string };
  let administrador: { id: string; token: string };
  let personal: { id: string; token: string };
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const R = '/api/v1/recintos';

  beforeAll(async () => {
    nucleo = new NucleoPrueba('recintos');
    await nucleo.iniciar();
    organizador = await nucleo.cuenta(['Organizador']);
    administrador = await nucleo.cuenta(['Administrador']);
    personal = await nucleo.cuenta();
  });
  afterAll(async () => { await nucleo?.cerrar(); });

  const datos = (extra: Record<string, unknown> = {}) => ({
    nombre: `Recinto ${randomUUID().slice(0, 8)}`, ciudad: 'Bogotá', direccion: 'Calle 1 # 2-3', capacidad: 1000,
    zonas: [{ nombre: 'General', capacidad: 700, x: 5, y: 5, ancho: 60, alto: 50, color: '#22d3ee' }, { nombre: 'VIP', capacidad: 200 }],
    ...extra,
  });
  const crear = (cuerpo: object, quien = organizador, esperado = 201) =>
    request(nucleo.url).post(R).set('Authorization', como(quien)).send(cuerpo).expect(esperado);

  async function eventoPublicado(recintoId: string, zonaId: string, cupos = 150) {
    const inicio = new Date(Date.now() + 20 * 86_400_000);
    const e = (await request(nucleo.url).post('/api/v1/eventos').set('Authorization', como(organizador)).send({
      nombre: `Evento ${randomUUID().slice(0, 8)}`, categoria: 'Conciertos', recintoId, aforoMaximo: 900,
      fechaInicio: inicio.toISOString(), fechaFin: new Date(inicio.getTime() + 3 * 3_600_000).toISOString(),
      localidades: [{ nombre: 'VIP', precio: 100000, cantidad: cupos, zonaRecintoId: zonaId }],
    }).expect(201)).body.evento;
    await request(nucleo.url).post(`/api/v1/eventos/${e.id}/publicar`).set('Authorization', como(organizador)).send({ version: 1 }).expect(200);
    return e;
  }

  it('pasos 1-8: Organizador y Administrador registran; el recinto queda para los eventos', async () => {
    const res = await crear(datos());
    expect(res.body.mensaje).toMatch(/elegir al crear un evento/);
    expect(res.body.recinto.zonas.map((z: { nombre: string }) => z.nombre)).toEqual(['General', 'VIP']);
    expect(res.body.recinto.zonas[0]).toMatchObject({ x: 5, y: 5, ancho: 60, alto: 50, color: '#22d3ee' });
    await crear(datos(), administrador);
    const activos = await request(nucleo.url).get(R).set('Authorization', como(organizador)).expect(200);
    expect(activos.body.some((r: { id: string }) => r.id === res.body.recinto.id)).toBe(true);
    await crear(datos(), personal, 403);
  });

  it('paso 4 y CU-029A: rechaza zonas que suman más que el recinto, zonas repetidas, posiciones incompletas y duplicados', async () => {
    const exceso = await crear(datos({ capacidad: 800 }), organizador, 400);
    expect(exceso.body).toMatchObject({ codigo: 'CAPACIDAD_ZONAS_EXCEDIDA', suma: 900, capacidad: 800 });
    expect((await crear(datos({ zonas: [{ nombre: 'A', capacidad: 1 }, { nombre: ' a', capacidad: 1 }] }), organizador, 400)).body.codigo).toBe('ZONA_REPETIDA');
    expect((await crear(datos({ zonas: [{ nombre: 'A', capacidad: 1, x: 1 }] }), organizador, 400)).body.codigo).toBe('ZONA_POSICION');
    expect((await crear(datos({ zonas: [{ nombre: 'A', capacidad: 1, x: 80, y: 0, ancho: 30, alto: 10 }] }), organizador, 400)).body.codigo).toBe('ZONA_POSICION');
    const primero = (await crear(datos())).body.recinto;
    expect((await crear(datos({ nombre: primero.nombre }), organizador, 409)).body.codigo).toBe('RECINTO_DUPLICADO');
  });

  it('paso 5: plano PNG/JPG/WebP con firma real, hasta 1,5 MB, y se puede quitar', async () => {
    const r = (await crear(datos())).body.recinto;
    const sube = await request(nucleo.url).put(`${R}/${r.id}/plano`).set('Authorization', como(organizador))
      .attach('plano', PNG, { filename: 'plano.png', contentType: 'image/png' }).expect(200);
    expect(sube.body).toMatchObject({ tipo: 'image/png', tamano: PNG.length });
    const baja = await request(nucleo.url).get(`${R}/${r.id}/plano`).set('Authorization', como(organizador)).buffer(true)
      .parse((res, cb) => { const partes: Buffer[] = []; res.on('data', (d: Buffer) => partes.push(d)); res.on('end', () => cb(null, Buffer.concat(partes))); }).expect(200);
    expect(baja.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(baja.body as Buffer, PNG)).toBe(0);
    await request(nucleo.url).put(`${R}/${r.id}/plano`).set('Authorization', como(organizador))
      .attach('plano', Buffer.from('<svg/>'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    await request(nucleo.url).put(`${R}/${r.id}/plano`).set('Authorization', como(organizador))
      .attach('plano', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' }).expect(400);
    const detalle = await request(nucleo.url).get(`${R}/${r.id}`).set('Authorization', como(organizador)).expect(200);
    expect(detalle.body.plano).toMatchObject({ tipo: 'image/png' });
    await request(nucleo.url).delete(`${R}/${r.id}/plano`).set('Authorization', como(organizador)).expect(204);
    await request(nucleo.url).get(`${R}/${r.id}/plano`).set('Authorization', como(organizador)).expect(404);
  });

  it('CU-029B: con eventos publicados avisa antes de cambiar y bloquea lo que dejaría vendido más de lo físico', async () => {
    const r = (await crear(datos())).body.recinto;
    const vip = r.zonas.find((z: { nombre: string }) => z.nombre === 'VIP');
    const general = r.zonas.find((z: { nombre: string }) => z.nombre === 'General');
    await eventoPublicado(r.id, vip.id, 150);
    const zonas = (cambios: Record<string, number>) => r.zonas.map((z: { id: string; nombre: string; capacidad: number }) =>
      ({ id: z.id, nombre: z.nombre, capacidad: cambios[z.nombre] ?? z.capacidad }));
    const base = { nombre: r.nombre, ciudad: r.ciudad, capacidad: 1000 };

    const bajo = await request(nucleo.url).put(`${R}/${r.id}`).set('Authorization', como(organizador)).send({ ...base, capacidad: 850, zonas: zonas({ General: 600 }) }).expect(409);
    expect(bajo.body.codigo).toBe('CAPACIDAD_COMPROMETIDA');
    expect((await request(nucleo.url).put(`${R}/${r.id}`).set('Authorization', como(organizador)).send({ ...base, zonas: zonas({ VIP: 100 }) }).expect(409)).body.codigo).toBe('ZONA_COMPROMETIDA');
    expect((await request(nucleo.url).put(`${R}/${r.id}`).set('Authorization', como(organizador)).send({ ...base, zonas: zonas({}).filter((z: { nombre: string }) => z.nombre !== 'VIP') }).expect(409)).body.codigo).toBe('ZONA_EN_USO');

    const aviso = await request(nucleo.url).put(`${R}/${r.id}`).set('Authorization', como(organizador)).send({ ...base, zonas: zonas({ General: 600 }) }).expect(409);
    expect(aviso.body).toMatchObject({ codigo: 'CONFIRMAR_IMPACTO', eventos: [expect.objectContaining({ estado: 'PUBLICADO' })] });
    const ok = await request(nucleo.url).put(`${R}/${r.id}`).set('Authorization', como(organizador)).send({ ...base, zonas: zonas({ General: 600 }), confirmarImpacto: true }).expect(200);
    expect(ok.body.recinto.zonas.find((z: { id: string }) => z.id === general.id).capacidad).toBe(600);
    // Cambiar solo la dirección no afecta el aforo: no pide confirmación.
    await request(nucleo.url).put(`${R}/${r.id}`).set('Authorization', como(organizador)).send({ ...base, direccion: 'Otra', zonas: ok.body.recinto.zonas.map((z: { id: string; nombre: string; capacidad: number }) => ({ id: z.id, nombre: z.nombre, capacidad: z.capacidad })) }).expect(200);
  });

  it('eliminar: solo sin eventos; con eventos se desactiva y deja de ofrecerse', async () => {
    const libre = (await crear(datos())).body.recinto;
    await request(nucleo.url).delete(`${R}/${libre.id}`).set('Authorization', como(organizador)).expect(204);
    const usado = (await crear(datos())).body.recinto;
    await eventoPublicado(usado.id, usado.zonas.find((z: { nombre: string }) => z.nombre === 'VIP').id, 10);
    expect((await request(nucleo.url).delete(`${R}/${usado.id}`).set('Authorization', como(organizador)).expect(409)).body.codigo).toBe('RECINTO_EN_USO');
    const zonas = usado.zonas.map((z: { id: string; nombre: string; capacidad: number }) => ({ id: z.id, nombre: z.nombre, capacidad: z.capacidad }));
    await request(nucleo.url).put(`${R}/${usado.id}`).set('Authorization', como(organizador))
      .send({ nombre: usado.nombre, ciudad: usado.ciudad, capacidad: 1000, activo: false, zonas, confirmarImpacto: true }).expect(200);
    const activos = await request(nucleo.url).get(R).set('Authorization', como(organizador)).expect(200);
    expect(activos.body.some((x: { id: string }) => x.id === usado.id)).toBe(false);
    const todos = await request(nucleo.url).get(R).query({ todos: 'true' }).set('Authorization', como(organizador)).expect(200);
    expect(todos.body.find((x: { id: string }) => x.id === usado.id)).toMatchObject({ activo: false, eventosActivos: 1 });
  });
});
