import { randomUUID } from 'node:crypto';
import { Channel, ChannelModel, connect, ConsumeMessage } from 'amqplib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource } from '../../modulos/eventos-recintos/persistencia/data-source';
import { NucleoPrueba, esperar } from '../logistica/nucleo-prueba';

/**
 * CU-026 · Gestión de eventos, contra el Núcleo compilado, con cuentas reales y
 * escuchando el exchange del contrato en RabbitMQ: lo que se comprueba es lo
 * que Boletería recibiría.
 */
describe('CU-026 · Gestión de eventos (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let amqp: ChannelModel;
  let canal: Channel;
  const recibidos: Record<string, unknown>[] = [];
  let organizador: { id: string; token: string };
  let administrador: { id: string; token: string };
  let personal: { id: string; token: string };
  const RUTA = '/api/v1/eventos';
  const como = (c: { token: string }) => `Bearer ${c.token}`;

  /** Cada prueba usa su propio recinto: así no chocan entre sí ni con corridas anteriores. */
  async function recinto(capacidad = 1000, zonas: { nombre: string; capacidad: number }[] = []) {
    const id = randomUUID();
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [id, `Recinto ${id.slice(0, 8)}`, 'Bogotá', capacidad]);
    const zonasCreadas: { id: string; nombre: string }[] = [];
    for (const z of zonas) {
      const [fila] = await eventos.query('INSERT INTO zonas_recinto (recinto_id,nombre,capacidad) VALUES ($1,$2,$3) RETURNING id', [id, z.nombre, z.capacidad]);
      zonasCreadas.push({ id: fila.id, nombre: z.nombre });
    }
    return { id, zonas: zonasCreadas };
  }

  function datos(recintoId: string, extra: Record<string, unknown> = {}, desdeDias = 10, horas = 4) {
    const inicio = new Date(Date.now() + desdeDias * 86_400_000);
    inicio.setUTCMinutes(0, 0, 0);
    return {
      nombre: `Evento ${randomUUID().slice(0, 8)}`,
      categoria: 'Conciertos',
      recintoId,
      fechaInicio: inicio.toISOString(),
      fechaFin: new Date(inicio.getTime() + horas * 3_600_000).toISOString(),
      localidades: [{ nombre: 'General', precio: 80000, cantidad: 300 }, { nombre: 'VIP', precio: 200000.5, cantidad: 50 }],
      ...extra,
    };
  }

  const crear = (cuerpo: object, esperado = 201) =>
    request(nucleo.url).post(RUTA).set('Authorization', como(organizador)).send(cuerpo).expect(esperado);
  const publicar = (id: string, version: number, esperado = 200) =>
    request(nucleo.url).post(`${RUTA}/${id}/publicar`).set('Authorization', como(organizador)).send({ version }).expect(esperado);
  /** Solo lo que el formulario envía: la validación rechaza campos de más. */
  type L = { id?: string; nombre: string; precio: number; cantidad: number };
  const loc = (ls: L[]) => ls.map(({ id, nombre, precio, cantidad }) => ({ id, nombre, precio, cantidad }));
  const mensajes = (eventoId: string, tipo: string) => recibidos.filter((m) => m.eventoId === eventoId && m.tipo === tipo);

  beforeAll(async () => {
    nucleo = new NucleoPrueba('gestion-eventos');
    eventos = new DataSource(opcionesDataSource());
    await eventos.initialize();
    // Una cola propia, atada al exchange del contrato, para ver lo publicado.
    amqp = await connect(process.env.RABBITMQ_URL!);
    canal = await amqp.createChannel();
    await canal.assertExchange('eventos.gestion', 'topic', { durable: true });
    const { queue } = await canal.assertQueue('', { exclusive: true, autoDelete: true });
    await canal.bindQueue(queue, 'eventos.gestion', 'evento.*');
    await canal.consume(queue, (m: ConsumeMessage | null) => { if (m) recibidos.push(JSON.parse(m.content.toString())); }, { noAck: true });
    await nucleo.iniciar();
    organizador = await nucleo.cuenta(['Organizador']);
    administrador = await nucleo.cuenta(['Administrador']);
    personal = await nucleo.cuenta();
  });

  afterAll(async () => {
    await nucleo?.cerrar();
    await canal?.close().catch(() => undefined);
    await amqp?.close().catch(() => undefined);
    await eventos?.destroy();
  });

  it('precondiciones: recintos y eventos solo para Organizador/Administrador; escribir solo el Organizador', async () => {
    const r = await recinto();
    const lista = await request(nucleo.url).get('/api/v1/recintos').set('Authorization', como(organizador)).expect(200);
    expect(lista.body.some((x: { id: string }) => x.id === r.id)).toBe(true);
    await request(nucleo.url).get('/api/v1/recintos').set('Authorization', como(personal)).expect(403);
    await request(nucleo.url).get(RUTA).set('Authorization', como(personal)).expect(403);
    await request(nucleo.url).get(RUTA).set('Authorization', como(administrador)).expect(200);
    await request(nucleo.url).post(RUTA).set('Authorization', como(administrador)).send(datos(r.id)).expect(403);
    await request(nucleo.url).get(RUTA).expect(401);
  });

  it('CU-026A: guardar sin publicar deja un borrador con historial y sin mensaje para Boletería', async () => {
    const r = await recinto(800);
    const res = await crear(datos(r.id));
    expect(res.body.evento).toMatchObject({ estado: 'BORRADOR', version: 1, aforoMaximo: 800, creadoPor: organizador.id });
    expect(res.body.evento.localidades.map((l: { nombre: string; precio: number }) => [l.nombre, l.precio])).toEqual([['General', 80000], ['VIP', 200000.5]]);
    expect(res.body.historial).toEqual([expect.objectContaining({ accion: 'CREADO', version: 1, realizadoPor: organizador.id })]);
    expect(res.body.disponibilidad).toEqual({ conflictos: [], sugerencias: [] });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(recibidos.filter((m) => m.eventoId === res.body.evento.id)).toHaveLength(0);
  });

  it('paso 4 y CU-026B: rechaza aforos que superan el recinto, la zona o el aforo máximo, y datos incoherentes', async () => {
    const r = await recinto(500, [{ nombre: 'Platea', capacidad: 100 }]);
    const sobreRecinto = await crear(datos(r.id, { aforoMaximo: 600 }), 400);
    expect(sobreRecinto.body).toMatchObject({ codigo: 'AFORO_SUPERA_RECINTO', capacidad: 500 });
    const sobreZona = await crear(datos(r.id, { localidades: [{ nombre: 'Platea', precio: 1, cantidad: 150, zonaRecintoId: r.zonas[0].id }] }), 400);
    expect(sobreZona.body).toMatchObject({ codigo: 'AFORO_SUPERA_ZONA', zona: { id: r.zonas[0].id, nombre: 'Platea', capacidad: 100, asignado: 150 } });
    const sobreAforo = await crear(datos(r.id, { aforoMaximo: 200 }), 400);
    expect(sobreAforo.body.codigo).toBe('CUPOS_SUPERAN_AFORO');
    expect((await crear(datos(r.id, { localidades: [{ nombre: 'A', precio: 1, cantidad: 1 }, { nombre: ' a ', precio: 2, cantidad: 1 }] }), 400)).body.codigo).toBe('LOCALIDAD_REPETIDA');
    expect((await crear(datos(r.id, {}, -2), 400)).body.codigo).toBe('FECHA_PASADA');
    await crear(datos(r.id, { localidades: [] }), 400);
    await crear(datos(r.id, { localidades: [{ nombre: 'X', precio: -1, cantidad: 1 }] }), 400);
    await crear(datos(randomUUID()), 404);
  });

  it('pasos 6-10: publicar valida, cambia el estado, registra el historial y publica el mensaje del contrato', async () => {
    const r = await recinto();
    const borrador = (await crear(datos(r.id, { artista: 'Artista e2e', permiteReventa: false }))).body.evento;
    const res = await publicar(borrador.id, 1);
    expect(res.body.evento).toMatchObject({ estado: 'PUBLICADO', version: 2 });
    expect(res.body.mensaje).toMatch(/Boletería/);
    expect(res.body.historial.map((h: { accion: string }) => h.accion)).toEqual(['PUBLICADO', 'CREADO']);
    await esperar(() => mensajes(borrador.id, 'EVENTO_PUBLICADO').length === 1);
    expect(mensajes(borrador.id, 'EVENTO_PUBLICADO')[0]).toMatchObject({
      versionContrato: 1, versionEvento: 2,
      evento: { nombre: borrador.nombre, estado: 'PUBLICADO', artista: 'Artista e2e', permiteReventa: false, aforoMaximo: 1000, ciudad: 'Bogotá' },
      localidades: [expect.objectContaining({ nombre: 'General', cantidad: 300, precio: 80000 }), expect.objectContaining({ nombre: 'VIP', cantidad: 50 })],
    });
    await publicar(borrador.id, 2, 409);
  });

  it('paso 5 y CU-026C: avisa del traslape al guardar, lo rechaza al publicar y sugiere horarios libres', async () => {
    const r = await recinto();
    const primero = (await crear(datos(r.id))).body.evento;
    await publicar(primero.id, 1);
    const choca = await crear(datos(r.id, {}, 10, 2));
    expect(choca.body.disponibilidad.conflictos).toEqual([expect.objectContaining({ id: primero.id })]);
    const rechazo = await publicar(choca.body.evento.id, 1, 409);
    expect(rechazo.body.codigo).toBe('EVENTO_TRASLAPADO');
    expect(rechazo.body.sugerencias.length).toBeGreaterThan(0);
    const sugerido = rechazo.body.sugerencias[0];
    expect(new Date(sugerido.fechaInicio).getTime()).toBeGreaterThanOrEqual(new Date(primero.fechaFin).getTime());
    // Mover el borrador a la sugerencia y publicarlo.
    const movido = await request(nucleo.url).put(`${RUTA}/${choca.body.evento.id}`).set('Authorization', como(organizador))
      .send({ ...datos(r.id), nombre: choca.body.evento.nombre, fechaInicio: sugerido.fechaInicio, fechaFin: sugerido.fechaFin,
        localidades: loc(choca.body.evento.localidades), version: 1 }).expect(200);
    expect(movido.body.disponibilidad.conflictos).toEqual([]);
    await publicar(choca.body.evento.id, 2);
    // La consulta previa que usa el portal dice lo mismo.
    const consulta = await request(nucleo.url).get(`${RUTA}/disponibilidad`).set('Authorization', como(organizador))
      .query({ recintoId: r.id, fechaInicio: primero.fechaInicio, fechaFin: primero.fechaFin }).expect(200);
    expect(consulta.body.conflictos).toEqual([expect.objectContaining({ id: primero.id })]);
  });

  it('consistencia: dos publicaciones simultáneas traslapadas en el mismo recinto, solo una gana', async () => {
    const r = await recinto();
    const a = (await crear(datos(r.id))).body.evento, b = (await crear(datos(r.id, {}, 10, 3))).body.evento;
    const resultados = await Promise.all([a, b].map((e) =>
      request(nucleo.url).post(`${RUTA}/${e.id}/publicar`).set('Authorization', como(organizador)).send({ version: 1 })));
    expect(resultados.map((x) => x.status).sort()).toEqual([200, 409]);
  });

  it('edición: control de versión, y en lo publicado no se cambia el recinto ni se reducen cupos, pero sí se amplía', async () => {
    const r = await recinto(), otro = await recinto();
    const borrador = (await crear(datos(r.id))).body.evento;
    await publicar(borrador.id, 1);
    const base = { ...datos(r.id), nombre: borrador.nombre, fechaInicio: borrador.fechaInicio, fechaFin: borrador.fechaFin };
    const [general, vip] = loc(borrador.localidades);

    const vieja = await request(nucleo.url).put(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador))
      .send({ ...base, localidades: loc(borrador.localidades), version: 1 }).expect(409);
    expect(vieja.body).toMatchObject({ codigo: 'VERSION_DESACTUALIZADA', versionActual: 2 });
    expect((await request(nucleo.url).put(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador))
      .send({ ...base, recintoId: otro.id, localidades: loc(borrador.localidades), version: 2 }).expect(409)).body.codigo).toBe('RECINTO_INMUTABLE');
    expect((await request(nucleo.url).put(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador))
      .send({ ...base, localidades: [{ ...general, cantidad: 10 }, vip], version: 2 }).expect(409)).body.codigo).toBe('LOCALIDAD_PUBLICADA');
    expect((await request(nucleo.url).put(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador))
      .send({ ...base, localidades: [general], version: 2 }).expect(409)).body.codigo).toBe('LOCALIDAD_PUBLICADA');

    const ampliado = await request(nucleo.url).put(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador))
      .send({ ...base, localidades: [{ ...general, cantidad: 400, precio: 90000 }, vip, { nombre: 'Palco', precio: 300000, cantidad: 20 }], version: 2 }).expect(200);
    expect(ampliado.body.evento).toMatchObject({ estado: 'PUBLICADO', version: 3 });
    expect(ampliado.body.historial[0]).toMatchObject({ accion: 'EDITADO', version: 3 });
    expect(ampliado.body.historial[0].cambios.localidades).toBeDefined();
    await esperar(() => mensajes(borrador.id, 'EVENTO_ACTUALIZADO').length === 1);
    expect(mensajes(borrador.id, 'EVENTO_ACTUALIZADO')[0]).toMatchObject({ versionEvento: 3 });
    expect((mensajes(borrador.id, 'EVENTO_ACTUALIZADO')[0].localidades as unknown[]).length).toBe(3);
  });

  it('CU-026D: cancelar lo publicado pide motivo, avisa a Boletería para la devolución y deja el evento inmutable', async () => {
    const r = await recinto();
    const e = (await crear(datos(r.id))).body.evento;
    await publicar(e.id, 1);
    await request(nucleo.url).post(`${RUTA}/${e.id}/cancelar`).set('Authorization', como(organizador)).send({ version: 2 }).expect(400);
    const res = await request(nucleo.url).post(`${RUTA}/${e.id}/cancelar`).set('Authorization', como(organizador))
      .send({ version: 2, motivo: 'El artista canceló la gira' }).expect(200);
    expect(res.body.evento).toMatchObject({ estado: 'CANCELADO', version: 3, motivoCancelacion: 'El artista canceló la gira' });
    expect(res.body.historial[0]).toMatchObject({ accion: 'CANCELADO', estadoAnterior: 'PUBLICADO', estadoNuevo: 'CANCELADO', realizadoPor: organizador.id });
    await esperar(() => mensajes(e.id, 'EVENTO_CANCELADO').length === 1);
    expect(mensajes(e.id, 'EVENTO_CANCELADO')[0]).toMatchObject({ cancelacion: { motivo: 'El artista canceló la gira', requiereDevolucion: true }, evento: { estado: 'CANCELADO' } });
    await request(nucleo.url).post(`${RUTA}/${e.id}/cancelar`).set('Authorization', como(organizador)).send({ version: 3, motivo: 'otra vez' }).expect(409);
    await request(nucleo.url).put(`${RUTA}/${e.id}`).set('Authorization', como(organizador))
      .send({ ...datos(r.id), localidades: loc(e.localidades), version: 3 }).expect(409);
  });

  it('eliminar: solo un borrador nunca publicado; su historial queda', async () => {
    const r = await recinto();
    const borrador = (await crear(datos(r.id))).body.evento;
    await request(nucleo.url).delete(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador)).query({ version: 1 }).expect(204);
    await request(nucleo.url).get(`${RUTA}/${borrador.id}`).set('Authorization', como(organizador)).expect(404);
    const historial = await eventos.query('SELECT accion FROM historial_eventos WHERE evento_id=$1 ORDER BY version', [borrador.id]);
    expect(historial.map((h: { accion: string }) => h.accion)).toEqual(['CREADO', 'ELIMINADO']);
    const publicado = (await crear(datos(r.id, {}, 20))).body.evento;
    await publicar(publicado.id, 1);
    await request(nucleo.url).delete(`${RUTA}/${publicado.id}`).set('Authorization', como(organizador)).query({ version: 2 }).expect(409);
  });
});
