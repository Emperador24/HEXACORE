import { randomUUID } from 'node:crypto';
import { ChannelModel, ConfirmChannel, connect } from 'amqplib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource } from '../../modulos/eventos-recintos/persistencia/data-source';
import { NucleoPrueba, esperar } from '../logistica/nucleo-prueba';

/**
 * CU-010 · Gestionar evacuación ante emergencias, contra el Núcleo compilado.
 * El recinto tiene tres zonas con geometría: A y B vecinas, C lejos. El aforo
 * llega por `acceso.eventos` como en el monitoreo y los avisos se entregan por
 * la cola de prioridad real.
 */
describe('CU-010 · Gestionar evacuación ante emergencias (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let amqp: ChannelModel;
  let canal: ConfirmChannel;
  let supervisor: { id: string; token: string };
  let personal: { id: string; token: string };
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const E = '/api/v1/emergencias';

  beforeAll(async () => {
    nucleo = new NucleoPrueba('evacuacion');
    eventos = new DataSource(opcionesDataSource());
    await eventos.initialize();
    await nucleo.iniciar();
    amqp = await connect(process.env.RABBITMQ_URL!);
    canal = await amqp.createConfirmChannel();
    supervisor = await nucleo.cuenta(['Organizador']);
    personal = await nucleo.cuenta();
  });
  afterAll(async () => {
    await nucleo?.cerrar();
    await canal?.close().catch(() => undefined);
    await amqp?.close().catch(() => undefined);
    await eventos?.destroy();
  });

  /** Recinto con zonas A y B contiguas en el plano y C apartada; evento publicado en curso con `asistentes` ingresos. */
  async function escenario(asistentes = 40) {
    const recinto = randomUUID(), evento = randomUUID();
    const zonas = { A: randomUUID(), B: randomUUID(), C: randomUUID() };
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 400]);
    for (const [nombre, id, cap, x, y, lado] of [['A', zonas.A, 100, 0, 0, 30], ['B', zonas.B, 100, 31, 0, 30], ['C', zonas.C, 200, 70, 70, 20]] as const) {
      await eventos.query('INSERT INTO zonas_recinto (id,recinto_id,nombre,capacidad,x,y,ancho,alto) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [id, recinto, `Zona ${nombre}`, cap, x, y, lado]);
    }
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3, now() - interval '1 hour', now() + interval '3 hours', 400, 'PUBLICADO', $4, now())`,
      [evento, `Emergencia ${evento.slice(0, 8)}`, recinto, supervisor.id]);
    for (let i = 0; i < asistentes; i++) {
      canal.publish('acceso.eventos', 'ingreso.registrado', Buffer.from(JSON.stringify({ id: randomUUID(), tipo: 'INGRESO_REGISTRADO', version: 1,
        entradaId: randomUUID(), eventoId: evento, puntoAcceso: 'Puerta Norte', escaneadoEn: new Date().toISOString(), ocurridoEn: new Date().toISOString() })), { persistent: true });
    }
    await canal.waitForConfirms();
    await esperar(async () => (await nucleo.datos.query('SELECT count(*)::int n FROM operacion.ingresos WHERE evento_id=$1', [evento]))[0].n === asistentes);
    return { recinto, evento, zonas };
  }

  async function plan(recinto: string, zonas: Record<'A' | 'B' | 'C', string>) {
    const res = await request(nucleo.url).put(`${E}/recintos/${recinto}/plan`).set('Authorization', como(supervisor)).send({
      salidas: [{ nombre: 'Salida Norte', capacidadPorMinuto: 5 }, { nombre: 'Salida Sur' }, { nombre: 'Salida Este' }],
      rutas: [
        { zonaId: zonas.A, salida: 'Salida Norte', prioridad: 1, descripcion: 'Por la escalera B' },
        { zonaId: zonas.A, salida: 'Salida Sur', prioridad: 2 },
        { zonaId: zonas.B, salida: 'Salida Norte', prioridad: 1 },
        { zonaId: zonas.C, salida: 'Salida Este', prioridad: 1 },
        { zonaId: zonas.C, salida: 'Salida Sur', prioridad: 2 },
      ],
    }).expect(200);
    return res.body as { completo: boolean; salidas: { id: string; nombre: string }[] };
  }

  const detalle = (id: string) => request(nucleo.url).get(`${E}/evacuaciones/${id}`).set('Authorization', como(supervisor)).expect(200).then((r) => r.body);
  const zona = (d: { zonas: { zonaId: string }[] }, id: string) => d.zonas.find((z) => z.zonaId === id) as unknown as Record<string, unknown>;
  const tipos = (d: { bitacora: { tipo: string }[] }) => d.bitacora.map((b) => b.tipo).reverse();

  it('pasos 1-13 con CU-010A, B, C y D: propuesta parcial, activación, ruta bloqueada, escalada, congestión y reporte', async () => {
    const { recinto, evento, zonas } = await escenario(40);
    const p = await plan(recinto, zonas);
    expect(p.completo).toBe(true);
    const salida = (nombre: string) => p.salidas.find((s) => s.nombre === nombre)!.id;

    // Seguridad: el personal no activa evacuaciones.
    await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(personal))
      .send({ tipo: 'INCENDIO', ubicacion: 'Cocina', nivel: 1, alcance: 'PARCIAL', zonaOrigenId: zonas.A }).expect(403);
    // Una parcial necesita la zona.
    await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor))
      .send({ tipo: 'INCENDIO', ubicacion: 'Cocina', nivel: 1, alcance: 'PARCIAL' }).expect(400);

    // Pasos 1-6 y CU-010C: solo la zona A; aforo estimado 40 × 100/400 = 10; ruta principal.
    const propuesta = (await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor))
      .send({ tipo: 'INCENDIO', ubicacion: 'Cocina de la zona A', nivel: 1, alcance: 'PARCIAL', zonaOrigenId: zonas.A }).expect(201)).body;
    const id = propuesta.evacuacion.id as string;
    expect(propuesta.evacuacion).toMatchObject({ estado: 'PROPUESTA', nivel: 1, alcance: 'PARCIAL', creadaPor: supervisor.id });
    expect(propuesta.zonas).toHaveLength(1);
    expect(zona(propuesta, zonas.A)).toMatchObject({ ocupacionEstimada: 10, salidaNombre: 'Salida Norte', instruccion: expect.stringContaining('escalera B') });
    await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor))
      .send({ tipo: 'INCENDIO', ubicacion: 'Otra', nivel: 1, alcance: 'TOTAL' }).expect(409);
    // El personal no ve una propuesta sin confirmar.
    expect((await request(nucleo.url).get(`${E}/eventos/${evento}/activa`).set('Authorization', como(personal)).expect(200)).body.activa).toBeNull();

    // Pasos 7-9: se activa y los avisos se entregan por la cola de prioridad.
    const activa = (await request(nucleo.url).post(`${E}/evacuaciones/${id}/confirmar`).set('Authorization', como(supervisor)).expect(201)).body;
    expect(activa.evacuacion).toMatchObject({ estado: 'ACTIVA', activadaPor: supervisor.id });
    expect(zona(activa, zonas.A).estado).toBe('EN_CURSO');
    await esperar(async () => (await detalle(id)).avisos.entregados === 2);
    expect((await detalle(id)).avisos.lista.map((a: { canal: string }) => a.canal).sort()).toEqual(['ASISTENTES', 'PERSONAL']);
    const vista = (await request(nucleo.url).get(`${E}/eventos/${evento}/activa`).set('Authorization', como(personal)).expect(200)).body.activa;
    expect(vista.evacuacion.id).toBe(id);

    // CU-010A: el personal avisa de que la Salida Norte está bloqueada; A pasa a la Sur.
    const bloqueada = (await request(nucleo.url).post(`${E}/evacuaciones/${id}/salidas/${salida('Salida Norte')}/bloqueo`).set('Authorization', como(personal))
      .send({ bloqueada: true, motivo: 'Humo en el pasillo' }).expect(201)).body;
    expect(zona(bloqueada, zonas.A)).toMatchObject({ salidaNombre: 'Salida Sur', instruccion: expect.stringContaining('Salida Sur') });
    expect(bloqueada.salidas.find((s: { nombre: string }) => s.nombre === 'Salida Norte')).toMatchObject({ habilitada: false, motivoBloqueo: 'Humo en el pasillo' });

    // CU-010D: a nivel 2 entra B (vecina de A en el plano), no C. B solo tiene la Norte: queda sin ruta.
    await request(nucleo.url).post(`${E}/evacuaciones/${id}/nivel`).set('Authorization', como(supervisor)).send({ nivel: 1, motivo: 'x' }).expect(400);
    const escalada = (await request(nucleo.url).post(`${E}/evacuaciones/${id}/nivel`).set('Authorization', como(supervisor))
      .send({ nivel: 2, motivo: 'El humo llegó a la zona B' }).expect(201)).body;
    expect(escalada.evacuacion.nivel).toBe(2);
    expect(escalada.zonas.map((z: { zonaId: string }) => z.zonaId).sort()).toEqual([zonas.A, zonas.B].sort());
    expect(zona(escalada, zonas.B)).toMatchObject({ salidaId: null, incorporadaEnNivel: 2, estado: 'EN_CURSO' });
    expect(escalada.alertas).toEqual([expect.objectContaining({ tipo: 'SIN_RUTA', severidad: 'critica', zonaId: zonas.B })]);
    expect(escalada.avisos.lista.some((a: { canal: string; mensaje: string }) => a.canal === 'PERSONAL' && /personal adicional/.test(a.mensaje))).toBe(true);
    await request(nucleo.url).post(`${E}/evacuaciones/${id}/nivel`).set('Authorization', como(supervisor)).send({ nivel: 2, motivo: 'otra vez' }).expect(409);

    // Se despeja la Norte: B la recupera; A sigue por la Sur.
    const despejada = (await request(nucleo.url).post(`${E}/evacuaciones/${id}/salidas/${salida('Salida Norte')}/bloqueo`).set('Authorization', como(supervisor))
      .send({ bloqueada: false }).expect(201)).body;
    expect(zona(despejada, zonas.B).salidaNombre).toBe('Salida Norte');
    expect(zona(despejada, zonas.A).salidaNombre).toBe('Salida Sur');

    // CU-010B: el personal reporta 150 personas en A (capacidad 100): se propone la Norte y el supervisor la confirma.
    const congestion = (await request(nucleo.url).patch(`${E}/evacuaciones/${id}/zonas/${zonas.A}`).set('Authorization', como(personal))
      .send({ personasRestantes: 150 }).expect(200)).body;
    const alerta = congestion.alertas.find((a: { tipo: string }) => a.tipo === 'ZONA_CONGESTIONADA');
    expect(alerta).toMatchObject({ zonaId: zonas.A, sugerencia: { salidaId: salida('Salida Norte'), salida: 'Salida Norte' } });
    await request(nucleo.url).post(`${E}/evacuaciones/${id}/zonas/${zonas.A}/ruta`).set('Authorization', como(personal)).send({ salidaId: salida('Salida Norte') }).expect(403);
    await request(nucleo.url).post(`${E}/evacuaciones/${id}/zonas/${zonas.A}/ruta`).set('Authorization', como(supervisor)).send({ salidaId: salida('Salida Este') }).expect(400);
    const desviada = (await request(nucleo.url).post(`${E}/evacuaciones/${id}/zonas/${zonas.A}/ruta`).set('Authorization', como(supervisor))
      .send({ salidaId: alerta.sugerencia.salidaId, motivo: 'Zona congestionada' }).expect(201)).body;
    expect(zona(desviada, zonas.A).salidaNombre).toBe('Salida Norte');
    // La Norte (5 personas/min) recibe ahora 150 + 10: saturada.
    expect(desviada.alertas.some((a: { tipo: string; salidaId: string }) => a.tipo === 'SALIDA_SATURADA' && a.salidaId === salida('Salida Norte'))).toBe(true);

    // Paso 12: no se finaliza con zonas pendientes.
    const pendiente = await request(nucleo.url).post(`${E}/evacuaciones/${id}/finalizar`).set('Authorization', como(supervisor)).send({}).expect(409);
    expect(pendiente.body).toMatchObject({ codigo: 'ZONAS_PENDIENTES', zonas: expect.arrayContaining([zonas.A, zonas.B]) });
    await request(nucleo.url).patch(`${E}/evacuaciones/${id}/zonas/${zonas.A}`).set('Authorization', como(personal)).send({ estado: 'EVACUADA' }).expect(200);
    const casi = (await request(nucleo.url).patch(`${E}/evacuaciones/${id}/zonas/${zonas.B}`).set('Authorization', como(personal)).send({ personasRestantes: 0 }).expect(200)).body;
    expect(casi.resumen).toMatchObject({ zonas: 2, evacuadas: 2, personasRestantes: 0 });
    expect(casi.alertas).toEqual([]);

    // Pasos 12-13: cierre y reporte de auditoría.
    const fin = (await request(nucleo.url).post(`${E}/evacuaciones/${id}/finalizar`).set('Authorization', como(supervisor))
      .send({ observaciones: 'Sin heridos' }).expect(201)).body;
    expect(fin.evacuacion).toMatchObject({ estado: 'FINALIZADA', finalizadaPor: supervisor.id, observaciones: 'Sin heridos' });
    expect(tipos(fin)).toEqual(['PROPUESTA', 'ACTIVADA', 'SALIDA_BLOQUEADA', 'RUTA_RECALCULADA', 'NIVEL_CAMBIADO', 'SALIDA_HABILITADA',
      'RUTA_RECALCULADA', 'ZONA_ACTUALIZADA', 'RUTA_CAMBIADA', 'ZONA_ACTUALIZADA', 'ZONA_ACTUALIZADA', 'FINALIZADA']);
    await esperar(async () => (await detalle(id)).avisos.pendientes === 0 && (await detalle(id)).avisos.entregados === (await detalle(id)).avisos.total);
    const reporte = (await request(nucleo.url).get(`${E}/evacuaciones/${id}/reporte`).set('Authorization', como(supervisor)).expect(200)).body;
    expect(reporte).toMatchObject({ final: true, tipo: 'INCENDIO', nivelFinal: 2, activadaPor: supervisor.id, finalizadaPor: supervisor.id, observaciones: 'Sin heridos' });
    expect(reporte.zonas.map((z: { estadoFinal: string }) => z.estadoFinal)).toEqual(['EVACUADA', 'EVACUADA']);
    expect(reporte.avisos.total).toBeGreaterThanOrEqual(8);
    expect(reporte.bitacora).toHaveLength(12);
    await request(nucleo.url).patch(`${E}/evacuaciones/${id}/zonas/${zonas.A}`).set('Authorization', como(personal)).send({ personasRestantes: 3 }).expect(409);
    // Ya se puede abrir otra.
    expect((await request(nucleo.url).get(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor)).expect(200)).body).toHaveLength(1);
  });

  it('nivel 3: evacuación total con altavoces y prioridad máxima; una propuesta se puede descartar', async () => {
    const { recinto, evento, zonas } = await escenario(20);
    await plan(recinto, zonas);
    const descartable = (await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor))
      .send({ tipo: 'PREVENTIVA', ubicacion: 'Alerta meteorológica', nivel: 1, alcance: 'PARCIAL', zonaOrigenId: zonas.C }).expect(201)).body;
    const descartada = (await request(nucleo.url).post(`${E}/evacuaciones/${descartable.evacuacion.id}/descartar`).set('Authorization', como(supervisor)).expect(201)).body;
    expect(descartada.evacuacion.estado).toBe('DESCARTADA');
    expect(descartada.avisos.total).toBe(0);

    const total = (await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor))
      .send({ tipo: 'AMENAZA_SEGURIDAD', ubicacion: 'Paquete sospechoso en la entrada', nivel: 3, alcance: 'PARCIAL', zonaOrigenId: zonas.A }).expect(201)).body;
    expect(total.evacuacion).toMatchObject({ nivel: 3, alcance: 'TOTAL' });
    expect(total.zonas).toHaveLength(3);
    // 20 × 200/400 = 10 en C, que sale por la Este.
    expect(zona(total, zonas.C)).toMatchObject({ ocupacionEstimada: 10, salidaNombre: 'Salida Este' });
    const id = total.evacuacion.id as string;
    await request(nucleo.url).post(`${E}/evacuaciones/${id}/confirmar`).set('Authorization', como(supervisor)).expect(201);
    await request(nucleo.url).post(`${E}/evacuaciones/${id}/confirmar`).set('Authorization', como(supervisor)).expect(409);
    await esperar(async () => (await detalle(id)).avisos.entregados === 5);
    const avisos = (await detalle(id)).avisos.lista as { canal: string; prioridad: number }[];
    expect(avisos.filter((a) => a.canal === 'ASISTENTES')).toHaveLength(3);
    expect(avisos.find((a) => a.canal === 'ALTAVOCES')!.prioridad).toBe(10);
    // Durante la evacuación no se cambia el plan.
    const bloqueo = await request(nucleo.url).put(`${E}/recintos/${recinto}/plan`).set('Authorization', como(supervisor)).send({ salidas: [], rutas: [] }).expect(409);
    expect(bloqueo.body.codigo).toBe('EVACUACION_EN_CURSO');
  });

  it('precondición 1: sin plan completo no se activa; el plan valida salidas y zonas', async () => {
    const { recinto, evento, zonas } = await escenario(0);
    const sinPlan = await request(nucleo.url).post(`${E}/eventos/${evento}/evacuaciones`).set('Authorization', como(supervisor))
      .send({ tipo: 'INUNDACION', ubicacion: 'Sótano', nivel: 1, alcance: 'TOTAL' }).expect(409);
    expect(sinPlan.body.codigo).toBe('PLAN_EVACUACION_INCOMPLETO');

    const desconocida = await request(nucleo.url).put(`${E}/recintos/${recinto}/plan`).set('Authorization', como(supervisor))
      .send({ salidas: [{ nombre: 'Salida 1' }], rutas: [{ zonaId: zonas.A, salida: 'Salida 2', prioridad: 1 }] }).expect(400);
    expect(desconocida.body.codigo).toBe('SALIDA_DESCONOCIDA');
    const ajena = await request(nucleo.url).put(`${E}/recintos/${recinto}/plan`).set('Authorization', como(supervisor))
      .send({ salidas: [{ nombre: 'Salida 1' }], rutas: [{ zonaId: randomUUID(), salida: 'Salida 1', prioridad: 1 }] }).expect(400);
    expect(ajena.body.codigo).toBe('ZONA_AJENA');

    const parcial = (await request(nucleo.url).put(`${E}/recintos/${recinto}/plan`).set('Authorization', como(supervisor))
      .send({ salidas: [{ nombre: 'Salida 1' }], rutas: [{ zonaId: zonas.A, salida: 'Salida 1', prioridad: 1 }] }).expect(200)).body;
    expect(parcial).toMatchObject({ completo: false, zonasSinRuta: ['Zona B', 'Zona C'] });
    // Guardar otra vez conserva el id de la salida (y su estado de bloqueo).
    const otraVez = (await request(nucleo.url).put(`${E}/recintos/${recinto}/plan`).set('Authorization', como(supervisor))
      .send({ salidas: [{ nombre: 'salida 1', capacidadPorMinuto: 30 }], rutas: [] }).expect(200)).body;
    expect(otraVez.salidas).toEqual([expect.objectContaining({ id: parcial.salidas[0].id, nombre: 'salida 1', capacidadPorMinuto: 30 })]);
  });
});
