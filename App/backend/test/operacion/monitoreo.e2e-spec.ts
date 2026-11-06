import { randomUUID } from 'node:crypto';
import { ChannelModel, ConfirmChannel, connect } from 'amqplib';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource } from '../../modulos/eventos-recintos/persistencia/data-source';
import { NucleoPrueba, esperar } from '../logistica/nucleo-prueba';

/**
 * CU-019 · Monitorear el evento, contra el Núcleo compilado. Los ingresos se
 * publican en `acceso.eventos` con el mismo formato que Acceso QR: es la
 * entrada real del monitoreo, sin Boletería en marcha.
 */
describe('CU-019 · Monitorear el evento (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let amqp: ChannelModel;
  let canal: ConfirmChannel;
  let organizador: { id: string; token: string };
  let personal: { id: string; token: string };
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const M = '/api/v1/monitoreo';

  beforeAll(async () => {
    nucleo = new NucleoPrueba('monitoreo');
    eventos = new DataSource(opcionesDataSource());
    await eventos.initialize();
    await nucleo.iniciar();
    amqp = await connect(process.env.RABBITMQ_URL!);
    canal = await amqp.createConfirmChannel();
    organizador = await nucleo.cuenta(['Organizador']);
    personal = await nucleo.cuenta();
  });
  afterAll(async () => {
    await nucleo?.cerrar();
    await canal?.close().catch(() => undefined);
    await amqp?.close().catch(() => undefined);
    await eventos?.destroy();
  });

  /** Un evento publicado que ya empezó (la API no deja crearlo en el pasado, así que va directo a la base). */
  async function eventoEnCurso(aforoMaximo: number) {
    const recinto = randomUUID(), id = randomUUID();
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 50000]);
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3, now() - interval '1 hour', now() + interval '3 hours', $4, 'PUBLICADO', $5, now())`,
      [id, `En curso ${id.slice(0, 8)}`, recinto, aforoMaximo, organizador.id],
    );
    return id;
  }

  async function ingresos(eventoId: string, punto: string, n: number, haceMin = 0, id?: string) {
    for (let i = 0; i < n; i++) {
      const cuerpo = { id: id ?? randomUUID(), tipo: 'INGRESO_REGISTRADO', version: 1, entradaId: randomUUID(), eventoId, puntoAcceso: punto,
        escaneadoEn: new Date(Date.now() - haceMin * 60_000 - i * 1000).toISOString(), ocurridoEn: new Date().toISOString() };
      canal.publish('acceso.eventos', 'ingreso.registrado', Buffer.from(JSON.stringify(cuerpo)), { persistent: true });
    }
    await canal.waitForConfirms();
  }

  const panel = (id: string) => request(nucleo.url).get(`${M}/eventos/${id}/panel`).set('Authorization', como(organizador)).expect(200).then((r) => r.body);

  it('pasos 1-3: el panel muestra aforo, accesos por punto y por minuto; un ingreso repetido no cuenta dos veces', async () => {
    const id = await eventoEnCurso(100);
    const repetido = randomUUID();
    await ingresos(id, 'Puerta Norte', 6);
    await ingresos(id, 'Puerta Sur', 1, 0, repetido);
    await ingresos(id, 'Puerta Sur', 1, 0, repetido);
    await esperar(async () => (await panel(id)).aforo.asistentes === 7);
    const p = await panel(id);
    expect(p.evento).toMatchObject({ id, enCurso: true });
    expect(p.aforo).toMatchObject({ asistentes: 7, aforoMaximo: 100, porcentaje: 7, disponibles: 93 });
    expect(p.accesos.puntos.map((x: { nombre: string; total: number }) => [x.nombre, x.total])).toEqual([['Puerta Norte', 6], ['Puerta Sur', 1]]);
    expect(p.accesos.porMinuto).toHaveLength(30);
    expect(p.accesos.ultimos5min).toBe(7);
    expect(p.parqueaderos.disponible).toBe(false);
    expect(p.incidencias.disponible).toBe(false);
    const lista = await request(nucleo.url).get(`${M}/eventos`).set('Authorization', como(organizador)).expect(200);
    expect(lista.body.find((e: { id: string }) => e.id === id)).toMatchObject({ enCurso: true });
  });

  it('paso 4 y CU-019A: alerta de aforo alto y luego completo; se resuelven solas cuando dejan de aplicar', async () => {
    const id = await eventoEnCurso(10);
    await ingresos(id, 'Puerta A', 9);
    await esperar(async () => (await panel(id)).aforo.asistentes === 9);
    expect((await panel(id)).alertas).toEqual([expect.objectContaining({ tipo: 'AFORO_ALTO', severidad: 'aviso' })]);
    await ingresos(id, 'Puerta A', 1);
    await esperar(async () => (await panel(id)).aforo.asistentes === 10);
    const completo = await panel(id);
    expect(completo.alertas).toEqual([expect.objectContaining({ tipo: 'AFORO_COMPLETO', severidad: 'critica', mensaje: expect.stringMatching(/rechaza/) })]);
    // La misma situación no se duplica al recalcular.
    await panel(id);
    const [{ n }] = await nucleo.datos.query(`SELECT count(*)::int n FROM operacion.alertas WHERE evento_id=$1 AND resuelta_en IS NULL`, [id]);
    expect(n).toBe(1);
    await eventos.query('UPDATE eventos SET aforo_maximo=1000 WHERE id=$1', [id]);
    expect((await panel(id)).alertas).toEqual([]);
    const historial = await request(nucleo.url).get(`${M}/eventos/${id}/alertas`).set('Authorization', como(organizador)).expect(200);
    expect(historial.body.every((a: { resueltaEn: string | null }) => a.resueltaEn)).toBe(true);
  });

  it('CU-019B: congestión en un punto sugiere redistribuir personal desde una zona con gente de más', async () => {
    const id = await eventoEnCurso(10000);
    // Zona con personal sobrante: 1 requerido y 2 presentes (asignados con entrada y sin salida).
    const zona = (await request(nucleo.url).post('/api/v1/logistica/zonas').set('Authorization', como(organizador))
      .send({ eventoId: id, nombre: 'Parqueadero', rolRequerido: `rol-${randomUUID().slice(0, 6)}`, personalRequerido: 1 }).expect(201)).body;
    for (let i = 0; i < 2; i++) {
      const [emp] = await nucleo.datos.query(`INSERT INTO empleados ("usuarioId",nombre,rol,credencial) VALUES ($1,'E','x',$2) RETURNING id`, [randomUUID(), `c-${randomUUID()}`]);
      const [t] = await nucleo.datos.query(`INSERT INTO turnos ("empleadoId","eventoId",zona,"horaInicio","horaFin","zonaEventoId") VALUES ($1,$2,'Parqueadero',now()-interval '1 hour',now()+interval '2 hours',$3) RETURNING id`, [emp.id, id, zona.id]);
      await nucleo.datos.query(`INSERT INTO registros_asistencia ("empleadoId","turnoId",tipo,"credencialUsada",timestamp,"sincronizadoEn") VALUES ($1,$2,'ENTRADA','c',now(),now())`, [emp.id, t.id]);
    }
    await ingresos(id, 'Puerta Norte', 35);
    await ingresos(id, 'Puerta Sur', 2);
    await esperar(async () => (await panel(id)).aforo.asistentes === 37);
    const p = await panel(id);
    expect(p.personal.zonas[0]).toMatchObject({ nombre: 'Parqueadero', requeridos: 1, presentes: 2, deficit: 0 });
    const congestion = p.alertas.find((a: { tipo: string }) => a.tipo === 'CONGESTION');
    expect(congestion).toMatchObject({ clave: 'CONGESTION:Puerta Norte', sugerencia: { accion: 'REDISTRIBUIR_PERSONAL', hacia: 'Puerta Norte', desde: [{ zona: 'Parqueadero', sobran: 1 }] } });
  });

  it('CU-019C y pasos 7-8: un acceso que deja de registrar se cierra con alternativa y la decisión queda con su resultado', async () => {
    const id = await eventoEnCurso(10000);
    await ingresos(id, 'Puerta Este', 6, 30);
    await ingresos(id, 'Puerta Oeste', 6);
    await esperar(async () => (await panel(id)).aforo.asistentes === 12);
    const alerta = (await panel(id)).alertas.find((a: { tipo: string }) => a.tipo === 'ACCESO_SIN_ACTIVIDAD');
    expect(alerta).toMatchObject({ severidad: 'critica', sugerencia: { accion: 'CERRAR_ACCESO', punto: 'Puerta Este', alternativa: 'Puerta Oeste' } });

    await request(nucleo.url).post(`${M}/eventos/${id}/decisiones`).set('Authorization', como(organizador))
      .send({ tipo: 'CERRAR_ACCESO', descripcion: 'Lector dañado', puntoAcceso: 'Puerta Este' }).expect(400);
    const decision = (await request(nucleo.url).post(`${M}/eventos/${id}/decisiones`).set('Authorization', como(organizador))
      .send({ tipo: 'CERRAR_ACCESO', descripcion: 'Lector dañado', puntoAcceso: 'Puerta Este', alternativa: 'Puerta Oeste', alertaId: alerta.id }).expect(201)).body;
    expect(decision).toMatchObject({ realizadoPor: organizador.id, alertaId: alerta.id });
    const despues = await panel(id);
    expect(despues.accesos.puntos.find((x: { nombre: string }) => x.nombre === 'Puerta Este')).toMatchObject({ estado: 'CERRADO', alternativa: 'Puerta Oeste' });
    expect(despues.alertas.find((a: { tipo: string }) => a.tipo === 'ACCESO_SIN_ACTIVIDAD')).toBeUndefined();

    const res = await request(nucleo.url).patch(`${M}/eventos/${id}/decisiones/${decision.id}`).set('Authorization', como(organizador))
      .send({ resultado: 'La fila pasó a la Puerta Oeste sin demoras' }).expect(200);
    expect(res.body.resultadoEn).toBeTruthy();
    expect((await panel(id)).decisiones[0]).toMatchObject({ id: decision.id, resultado: 'La fila pasó a la Puerta Oeste sin demoras' });
    await request(nucleo.url).post(`${M}/eventos/${id}/decisiones`).set('Authorization', como(organizador))
      .send({ tipo: 'HABILITAR_ACCESO', descripcion: 'Lector cambiado', puntoAcceso: 'Puerta Este' }).expect(201);
    expect((await panel(id)).accesos.puntos.find((x: { nombre: string }) => x.nombre === 'Puerta Este').estado).toBe('HABILITADO');
  });

  it('tiempo real: el flujo SSE entrega el panel y lo vuelve a enviar', async () => {
    const id = await eventoEnCurso(100);
    const control = new AbortController();
    const respuesta = await fetch(`${nucleo.url}${M}/eventos/${id}/flujo`, { headers: { Authorization: como(organizador) }, signal: control.signal });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toMatch(/text\/event-stream/);
    const lector = respuesta.body!.getReader();
    let texto = '';
    const decoder = new TextDecoder();
    while ((texto.match(/event: panel/g) ?? []).length < 2) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += decoder.decode(value);
    }
    control.abort();
    expect((texto.match(/event: panel/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const primero = JSON.parse(texto.split('\n').find((l) => l.startsWith('data: '))!.slice(6));
    expect(primero.evento.id).toBe(id);
  });

  it('seguridad y precondición: solo Organizador/Administrador, y solo eventos publicados', async () => {
    const id = await eventoEnCurso(100);
    await request(nucleo.url).get(`${M}/eventos/${id}/panel`).set('Authorization', como(personal)).expect(403);
    await request(nucleo.url).get(`${M}/eventos`).expect(401);
    await eventos.query(`UPDATE eventos SET estado='CANCELADO' WHERE id=$1`, [id]);
    expect((await request(nucleo.url).get(`${M}/eventos/${id}/panel`).set('Authorization', como(organizador)).expect(409)).body.codigo).toBe('EVENTO_NO_PUBLICADO');
    await request(nucleo.url).get(`${M}/eventos/${randomUUID()}/panel`).set('Authorization', como(organizador)).expect(404);
  });
});
