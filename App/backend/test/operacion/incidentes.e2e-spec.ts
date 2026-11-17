import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource as opcionesEventos } from '../../modulos/eventos-recintos/persistencia/data-source';
import { opcionesDataSource as opcionesOperacion } from '../../modulos/operacion/persistencia/data-source';
import { NucleoPrueba, esperar } from '../logistica/nucleo-prueba';

/**
 * CU-020 · Gestionar incidentes, contra el Núcleo compilado. El evento está
 * publicado y en curso (precondición 1); el personal lo registra, el
 * supervisor reclasifica y asigna un responsable, y se cierra con nota de
 * resolución (CU-020B) sin pasar por «en atención».
 */
describe('CU-020 · Gestionar incidentes (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let operacion: DataSource;
  let supervisor: { id: string; token: string };
  let personal: { id: string; token: string };
  let otroPersonal: { id: string; token: string };
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const I = '/api/v1/incidentes';

  beforeAll(async () => {
    nucleo = new NucleoPrueba('incidentes');
    eventos = new DataSource(opcionesEventos());
    operacion = new DataSource(opcionesOperacion());
    await eventos.initialize();
    await operacion.initialize();
    await nucleo.iniciar();
    supervisor = await nucleo.cuenta(['Organizador']);
    personal = await nucleo.cuenta();
    otroPersonal = await nucleo.cuenta();
  });
  afterAll(async () => {
    await nucleo?.cerrar();
    await eventos?.destroy();
    await operacion?.destroy();
  });

  /** Evento publicado, en curso ahora mismo. */
  async function eventoEnCurso() {
    const recinto = randomUUID(), evento = randomUUID();
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 400]);
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3, now() - interval '1 hour', now() + interval '3 hours', 400, 'PUBLICADO', $4, now())`,
      [evento, `Incidente ${evento.slice(0, 8)}`, recinto, supervisor.id]);
    return evento;
  }

  /** Evento publicado pero que ya terminó: no admite nuevos incidentes. */
  async function eventoTerminado() {
    const recinto = randomUUID(), evento = randomUUID();
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 400]);
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3, now() - interval '5 hours', now() - interval '1 hour', 400, 'PUBLICADO', $4, now() - interval '5 hours')`,
      [evento, `Terminado ${evento.slice(0, 8)}`, recinto, supervisor.id]);
    return evento;
  }

  const registrar = (eventoId: string, cuerpo: { tipo: string; ubicacion: string; descripcion: string }, actor = personal) =>
    request(nucleo.url).post(`${I}/eventos/${eventoId}/incidentes`).set('Authorization', como(actor)).send(cuerpo);

  it('rechaza registrar un incidente en un evento que ya terminó (precondición 1)', async () => {
    const evento = await eventoTerminado();
    const res = await registrar(evento, { tipo: 'Derrame de líquidos', ubicacion: 'Zona B', descripcion: 'Piso resbaloso' }).expect(409);
    expect(res.body.codigo).toBe('EVENTO_NO_EN_CURSO');
  });

  it('un incendio se clasifica CRÍTICA de entrada (paso 2) y notifica al supervisor', async () => {
    const evento = await eventoEnCurso();
    const res = await registrar(evento, { tipo: 'Incendio en zona de comidas', ubicacion: 'Zona A, puesto 3', descripcion: 'Humo saliendo de la freidora' }).expect(201);
    expect(res.body).toMatchObject({ eventoId: evento, prioridad: 'CRITICA', estado: 'ABIERTO', reportadoPor: personal.id });
    expect(res.body.id).toBeTruthy();

    // Paso 3: el aviso al supervisor queda en la bandeja de salida y, con el
    // NotificadorIncidentes real corriendo en el Núcleo, se publica y entrega.
    await esperar(async () => {
      const [fila] = await operacion.query(
        `SELECT entregada_en AS "entregadaEn" FROM notificaciones_incidentes WHERE incidente_id = $1 AND destinatario = 'SUPERVISOR'`,
        [res.body.id],
      );
      return !!fila?.entregadaEn;
    });
  });

  it('un reporte sin palabras clave queda en prioridad MEDIA por defecto', async () => {
    const evento = await eventoEnCurso();
    const res = await registrar(evento, { tipo: 'Fuga de agua', ubicacion: 'Baños zona C', descripcion: 'Agua acumulándose' }).expect(201);
    expect(res.body.prioridad).toBe('MEDIA');
  });

  it('el personal no puede reclasificar prioridad ni asignar responsable (solo el supervisor)', async () => {
    const evento = await eventoEnCurso();
    const { body: incidente } = await registrar(evento, { tipo: 'Robo menor', ubicacion: 'Parqueadero', descripcion: 'Hurto de un bolso' }).expect(201);
    expect(incidente.prioridad).toBe('ALTA');

    await request(nucleo.url).patch(`${I}/incidentes/${incidente.id}/prioridad`).set('Authorization', como(personal)).send({ prioridad: 'CRITICA' }).expect(403);
    await request(nucleo.url).post(`${I}/incidentes/${incidente.id}/responsable`).set('Authorization', como(personal)).send({ responsableId: otroPersonal.id }).expect(403);
  });

  it('ciclo completo: registrar, reclasificar (CU-020A), asignar, reportar avance y cerrar, con bitácora de auditoría (paso 9)', async () => {
    const evento = await eventoEnCurso();
    const { body: incidente } = await registrar(evento, { tipo: 'Fuga de agua', ubicacion: 'Baños zona C', descripcion: 'Agua acumulándose' }).expect(201);
    expect(incidente.prioridad).toBe('MEDIA');

    // CU-020A: el supervisor reclasifica la prioridad.
    const reclasificado = await request(nucleo.url).patch(`${I}/incidentes/${incidente.id}/prioridad`)
      .set('Authorization', como(supervisor)).send({ prioridad: 'ALTA' }).expect(200);
    expect(reclasificado.body.prioridad).toBe('ALTA');

    // Paso 5-6: asigna un responsable; el incidente pasa a EN_ATENCION y se notifica al responsable.
    const asignado = await request(nucleo.url).post(`${I}/incidentes/${incidente.id}/responsable`)
      .set('Authorization', como(supervisor)).send({ responsableId: otroPersonal.id }).expect(201);
    expect(asignado.body).toMatchObject({ estado: 'EN_ATENCION', responsableId: otroPersonal.id });
    await esperar(async () => {
      const [fila] = await operacion.query(
        `SELECT entregada_en AS "entregadaEn" FROM notificaciones_incidentes WHERE incidente_id = $1 AND destinatario = 'RESPONSABLE'`,
        [incidente.id],
      );
      return !!fila?.entregadaEn;
    });

    // Pasos 7-8: el responsable reporta el avance.
    const avance = await request(nucleo.url).patch(`${I}/incidentes/${incidente.id}/avance`)
      .set('Authorization', como(otroPersonal)).send({ estado: 'RESUELTO', nota: 'Se cerró la llave de paso' }).expect(200);
    expect(avance.body.estado).toBe('RESUELTO');

    // Paso 8/9: se cierra con nota de resolución.
    const cerrado = await request(nucleo.url).post(`${I}/incidentes/${incidente.id}/cerrar`)
      .set('Authorization', como(otroPersonal)).send({ notaResolucion: 'Fuga reparada; piso secado y señalizado mientras tanto' }).expect(201);
    expect(cerrado.body).toMatchObject({ estado: 'CERRADO', notaResolucion: 'Fuga reparada; piso secado y señalizado mientras tanto' });
    expect(cerrado.body.cerradoPor).toBe(otroPersonal.id);

    // No se puede volver a tocar un incidente cerrado.
    await request(nucleo.url).patch(`${I}/incidentes/${incidente.id}/avance`)
      .set('Authorization', como(otroPersonal)).send({ estado: 'EN_ATENCION' }).expect(409);

    const detalle = await request(nucleo.url).get(`${I}/incidentes/${incidente.id}`).set('Authorization', como(supervisor)).expect(200);
    const tipos = (detalle.body.bitacora as { tipo: string }[]).map((b) => b.tipo).reverse();
    expect(tipos).toEqual(['CREADO', 'PRIORIDAD_CAMBIADA', 'RESPONSABLE_ASIGNADO', 'AVANCE_REPORTADO', 'CERRADO']);
  });

  it('CU-020B: se cierra directamente desde ABIERTO, sin pasar por EN_ATENCION ni asignar responsable', async () => {
    const evento = await eventoEnCurso();
    const { body: incidente } = await registrar(evento, { tipo: 'Objeto perdido', ubicacion: 'Taquilla', descripcion: 'Una chaqueta' }).expect(201);
    expect(incidente.estado).toBe('ABIERTO');
    expect(incidente.prioridad).toBe('BAJA');

    const cerrado = await request(nucleo.url).post(`${I}/incidentes/${incidente.id}/cerrar`)
      .set('Authorization', como(personal)).send({ notaResolucion: 'Se devolvió al dueño en el mismo punto' }).expect(201);
    expect(cerrado.body.estado).toBe('CERRADO');
    expect(cerrado.body.responsableId).toBeNull();
  });

  it('CU-020A: el listado ordena por prioridad de atención, no por fecha de registro', async () => {
    const evento = await eventoEnCurso();
    await registrar(evento, { tipo: 'Objeto perdido', ubicacion: 'Taquilla', descripcion: 'leve, una gorra' }).expect(201);
    await registrar(evento, { tipo: 'Incendio en bodega', ubicacion: 'Bodega', descripcion: 'Humo denso' }).expect(201);
    await registrar(evento, { tipo: 'Fuga de agua', ubicacion: 'Baños', descripcion: 'Charco creciendo' }).expect(201);

    const listado = await request(nucleo.url).get(`${I}/eventos/${evento}/incidentes`).set('Authorization', como(supervisor)).expect(200);
    expect(listado.body.map((i: { prioridad: string }) => i.prioridad)).toEqual(['CRITICA', 'MEDIA', 'BAJA']);
  });

  it('CU-019: el panel de monitoreo refleja los incidentes abiertos del evento, no un hueco vacío', async () => {
    const evento = await eventoEnCurso();
    await registrar(evento, { tipo: 'Incendio en zona de comidas', ubicacion: 'Zona A', descripcion: 'Conato de incendio' }).expect(201);
    await registrar(evento, { tipo: 'Fuga de agua', ubicacion: 'Baños', descripcion: 'Charco' }).expect(201);

    const panel = await request(nucleo.url).get(`/api/v1/monitoreo/eventos/${evento}/panel`).set('Authorization', como(supervisor)).expect(200);
    expect(panel.body.incidencias).toMatchObject({ disponible: true, abiertos: 2, porPrioridad: { CRITICA: 1, MEDIA: 1, ALTA: 0, BAJA: 0 } });
    expect(panel.body.alertas.some((a: { tipo: string }) => a.tipo === 'INCIDENTES_CRITICOS')).toBe(true);
  });
});
