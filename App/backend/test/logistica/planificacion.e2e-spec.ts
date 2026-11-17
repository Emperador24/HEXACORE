import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { opcionesDataSource as opcionesEventos } from '../../modulos/eventos-recintos/persistencia/data-source';
import { NucleoPrueba } from './nucleo-prueba';

/**
 * CU-016 · Planificar logística del evento (y su integración con CU-030,
 * Gestión de Proveedores), contra el Núcleo compilado. El actor «Coordinador
 * Logístico» lo ejerce Organizador.
 */
describe('CU-016 · Planificar logística del evento (e2e)', () => {
  let nucleo: NucleoPrueba;
  let eventos: DataSource;
  let coordinador: { id: string; token: string };
  const L = '/api/v1/planificacion';
  const P = '/api/v1/proveedores';
  const LOG = '/api/v1/logistica';
  const como = (c: { token: string }) => `Bearer ${c.token}`;
  const sufijo = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    nucleo = new NucleoPrueba('planificacion');
    eventos = new DataSource(opcionesEventos());
    await eventos.initialize();
    await nucleo.iniciar();
    coordinador = await nucleo.cuenta(['Organizador']);
  });
  afterAll(async () => { await nucleo?.cerrar(); await eventos?.destroy(); });

  /** Evento publicado, con la ventana de fechas que se pida (por defecto, dentro de un mes). */
  async function crearEvento(desdeHoras = 24 * 30, duracionHoras = 5) {
    const recinto = randomUUID(), evento = randomUUID();
    const inicio = new Date(Date.now() + desdeHoras * 3_600_000);
    const fin = new Date(inicio.getTime() + duracionHoras * 3_600_000);
    await eventos.query('INSERT INTO recintos (id,nombre,ciudad,capacidad) VALUES ($1,$2,$3,$4)', [recinto, `R ${recinto.slice(0, 8)}`, 'Bogotá', 400]);
    await eventos.query(
      `INSERT INTO eventos (id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en)
       VALUES ($1,$2,'Conciertos',$3,$4,$5,400,'PUBLICADO',$6,now())`,
      [evento, `Plan ${evento.slice(0, 8)}`, recinto, inicio, fin, coordinador.id],
    );
    return { evento, inicio, fin };
  }

  const recurso = (datos: Record<string, unknown> = {}) =>
    request(nucleo.url).post(`${L}/recursos`).set('Authorization', como(coordinador))
      .send({ nombre: `Planta ${sufijo()}`, tipo: 'GENERADOR', cantidadTotal: 2, costoUnitario: 500000, ...datos });

  const proveedor = (datos: Record<string, unknown> = {}) =>
    request(nucleo.url).post(P).set('Authorization', como(coordinador))
      .send({ nombre: `Proveedor ${sufijo()}`, tipoServicio: 'SONIDO', costoReferencia: 900000, ...datos });

  const plan = async (eventoId: string, datos: Record<string, unknown> = {}) =>
    (await request(nucleo.url).post(`${L}/eventos/${eventoId}/plan`).set('Authorization', como(coordinador)).send(datos).expect(201)).body as { id: string };

  const detalle = (planId: string) => request(nucleo.url).get(`${L}/planes/${planId}`).set('Authorization', como(coordinador)).expect(200).then((r) => r.body);

  it('precondición 1: no se puede planificar un evento que no existe', async () => {
    await request(nucleo.url).post(`${L}/eventos/${randomUUID()}/plan`).set('Authorization', como(coordinador)).send({}).expect(404);
  });

  it('paso 1: acceder dos veces a la planificación del mismo evento retoma el mismo plan (no crea dos)', async () => {
    const { evento } = await crearEvento();
    const p1 = await plan(evento, { presupuesto: 10000000 });
    const p2 = await plan(evento);
    expect(p2.id).toBe(p1.id);
  });

  it('pasos 2-7: asigna recurso, proveedor y personal, y calcula el costo estimado', async () => {
    const { evento } = await crearEvento();
    const { id: planId } = await plan(evento, { presupuesto: 50000000 });
    const { body: rec } = await recurso({ costoUnitario: 400000 }).expect(201);
    const { body: prov } = await proveedor({ costoReferencia: 1000000 }).expect(201);

    await request(nucleo.url).post(`${L}/planes/${planId}/recursos`).set('Authorization', como(coordinador)).send({ recursoId: rec.id, cantidad: 2 }).expect(201);
    await request(nucleo.url).post(`${L}/planes/${planId}/proveedores`).set('Authorization', como(coordinador)).send({ proveedorId: prov.id, costo: 1000000 }).expect(201);

    const d = await detalle(planId);
    expect(d.recursos).toHaveLength(1);
    expect(d.proveedores).toHaveLength(1);
    expect(d.plan.costoEstimado).toBe(2 * 400000 + 1000000);
    expect(d.conflictos).toHaveLength(0);
    // Post-condición 1: el cronograma ya existe aunque el plan siga en borrador.
    expect(d.cronograma.map((c: { tipo: string }) => c.tipo)).toEqual(['MONTAJE', 'EVENTO', 'DESMONTAJE']);
  });

  it('CU-016B: asignar un proveedor inactivo propone alternativas del mismo tipo de servicio', async () => {
    const { evento } = await crearEvento();
    const { id: planId } = await plan(evento);
    const { body: inactivo } = await proveedor().expect(201);
    await request(nucleo.url).post(`${P}/${inactivo.id}/baja`).set('Authorization', como(coordinador)).send({}).expect(201);
    const { body: alternativa } = await proveedor({ tipoServicio: inactivo.tipoServicio }).expect(201);

    const res = await request(nucleo.url).post(`${L}/planes/${planId}/proveedores`).set('Authorization', como(coordinador))
      .send({ proveedorId: inactivo.id }).expect(409);
    expect(res.body.codigo).toBe('PROVEEDOR_NO_DISPONIBLE');
    expect(res.body.alternativas.some((a: { id: string }) => a.id === alternativa.id)).toBe(true);
  });

  it('CU-016C: dos eventos que se cruzan en fecha y piden el mismo recurso por encima de lo que hay generan una alerta de recursos insuficientes', async () => {
    const a = await crearEvento(24 * 40, 10); // 40 días, dura 10h
    const b = await crearEvento(24 * 40 + 5, 10); // empieza 5h después: se cruza con a
    const { body: rec } = await recurso({ cantidadTotal: 3 }).expect(201);
    const planA = await plan(a.evento);
    const planB = await plan(b.evento);
    await request(nucleo.url).post(`${L}/planes/${planA.id}/recursos`).set('Authorization', como(coordinador)).send({ recursoId: rec.id, cantidad: 2 }).expect(201);
    await request(nucleo.url).post(`${L}/planes/${planB.id}/recursos`).set('Authorization', como(coordinador)).send({ recursoId: rec.id, cantidad: 2 }).expect(201);

    const dA = await detalle(planA.id);
    expect(dA.conflictos.some((c: { tipo: string }) => c.tipo === 'RECURSO_INSUFICIENTE')).toBe(true);

    // Paso 8: no se aprueba con conflictos pendientes (paso 6 exige resolverlos antes).
    await request(nucleo.url).post(`${L}/planes/${planA.id}/aprobar`).set('Authorization', como(coordinador)).send({}).expect(409);

    // Ajusta la selección (paso 6): retira el recurso y el conflicto desaparece.
    await request(nucleo.url).delete(`${L}/planes/${planA.id}/recursos/${rec.id}`).set('Authorization', como(coordinador)).expect(200);
    const dA2 = await detalle(planA.id);
    expect(dA2.conflictos).toHaveLength(0);
  });

  it('un proveedor ya asignado a un evento que se cruza en fecha queda en conflicto, con alternativas', async () => {
    const a = await crearEvento(24 * 50, 10);
    const b = await crearEvento(24 * 50 + 3, 10);
    const { body: prov } = await proveedor().expect(201);
    const { body: alternativa } = await proveedor({ tipoServicio: prov.tipoServicio }).expect(201);
    const planA = await plan(a.evento);
    const planB = await plan(b.evento);
    await request(nucleo.url).post(`${L}/planes/${planA.id}/proveedores`).set('Authorization', como(coordinador)).send({ proveedorId: prov.id }).expect(201);
    await request(nucleo.url).post(`${L}/planes/${planB.id}/proveedores`).set('Authorization', como(coordinador)).send({ proveedorId: prov.id }).expect(201);

    const dB = await detalle(planB.id);
    const conflicto = dB.conflictos.find((c: { tipo: string }) => c.tipo === 'PROVEEDOR_OCUPADO');
    expect(conflicto).toBeTruthy();
    expect(conflicto.alternativas.some((alt: { id: string }) => alt.id === alternativa.id)).toBe(true);

    // CU-030B, desde el otro lado: ese proveedor ya tiene asignaciones activas (eventos futuros).
    const baja = await request(nucleo.url).post(`${P}/${prov.id}/baja`).set('Authorization', como(coordinador)).send({}).expect(409);
    expect(baja.body.codigo).toBe('ASIGNACIONES_ACTIVAS');
  });

  it('CU-030A: editar un proveedor asignado a un evento futuro advierte del impacto antes de confirmar', async () => {
    const { evento } = await crearEvento(24 * 60, 6);
    const { id: planId } = await plan(evento);
    const { body: prov } = await proveedor().expect(201);
    await request(nucleo.url).post(`${L}/planes/${planId}/proveedores`).set('Authorization', como(coordinador)).send({ proveedorId: prov.id }).expect(201);

    const sinConfirmar = await request(nucleo.url).patch(`${P}/${prov.id}`).set('Authorization', como(coordinador))
      .send({ nombre: prov.nombre, tipoServicio: prov.tipoServicio, telefono: '+57 300 111 2233' }).expect(409);
    expect(sinConfirmar.body.codigo).toBe('IMPACTO_PLANIFICACION');
    expect(sinConfirmar.body.eventos[0].eventoId).toBe(evento);

    const confirmado = await request(nucleo.url).patch(`${P}/${prov.id}`).set('Authorization', como(coordinador))
      .send({ nombre: prov.nombre, tipoServicio: prov.tipoServicio, telefono: '+57 300 111 2233', confirmarImpacto: true }).expect(200);
    expect(confirmado.body.telefono).toBe('+57 300 111 2233');
  });

  it('CU-016A: sin personal disponible, se puede solicitar personal adicional', async () => {
    const { evento } = await crearEvento();
    const { id: planId } = await plan(evento);
    await request(nucleo.url).post(`${L}/planes/${planId}/personal-adicional`).set('Authorization', como(coordinador))
      .send({ rol: 'Entrada', cantidad: 4, motivo: 'El personal disponible no alcanza para las cuatro zonas' }).expect(201);
    const d = await detalle(planId);
    expect(d.solicitudesPersonalAdicional).toHaveLength(1);
    expect(d.solicitudesPersonalAdicional[0]).toMatchObject({ rol: 'Entrada', cantidad: 4, estado: 'PENDIENTE' });
  });

  it('pasos 3 y 8: asigna personal real y lo refleja en el detalle', async () => {
    const { evento } = await crearEvento();
    const { id: planId } = await plan(evento);
    const s = sufijo();
    const { body: empleado } = await request(nucleo.url).post(`${LOG}/empleados`).set('Authorization', como(coordinador))
      .send({ usuarioId: randomUUID(), nombre: `Empleado ${s}`, rol: 'Entrada', credencial: `cred-${s}` }).expect(201);

    await request(nucleo.url).post(`${L}/planes/${planId}/personal`).set('Authorization', como(coordinador)).send({ empleadoId: empleado.id }).expect(201);
    const d = await detalle(planId);
    expect(d.personal).toHaveLength(1);
    expect(d.personal[0].empleadoId).toBe(empleado.id);
  });

  it('CU-016E: aprobar con el costo por encima del presupuesto exige confirmar', async () => {
    const { evento } = await crearEvento();
    const { id: planId } = await plan(evento, { presupuesto: 100000 });
    const { body: rec } = await recurso({ costoUnitario: 1000000, cantidadTotal: 5 }).expect(201);
    await request(nucleo.url).post(`${L}/planes/${planId}/recursos`).set('Authorization', como(coordinador)).send({ recursoId: rec.id, cantidad: 1 }).expect(201);

    const d = await detalle(planId);
    expect(d.excedePresupuesto).toBe(true);

    const rechazado = await request(nucleo.url).post(`${L}/planes/${planId}/aprobar`).set('Authorization', como(coordinador)).send({}).expect(409);
    expect(rechazado.body.codigo).toBe('PRESUPUESTO_SUPERADO');

    const aprobado = await request(nucleo.url).post(`${L}/planes/${planId}/aprobar`).set('Authorization', como(coordinador)).send({ confirmarSobrePresupuesto: true }).expect(201);
    expect(aprobado.body.plan).toMatchObject({ estado: 'APROBADO' });
    expect(aprobado.body.plan.aprobadoPor).toBe(coordinador.id);

    // Paso 10: notifica a proveedores y personal (aquí no hay proveedores/personal, así que no hay NOTIFICADO_*,
    // pero sí queda el APROBADO en la bitácora).
    expect(aprobado.body.bitacora.some((b: { tipo: string }) => b.tipo === 'APROBADO')).toBe(true);

    // Un plan aprobado no se puede seguir editando.
    await request(nucleo.url).post(`${L}/planes/${planId}/recursos`).set('Authorization', como(coordinador)).send({ recursoId: rec.id, cantidad: 1 }).expect(409);
  });

  it('paso 10: al aprobar, notifica (bitácora) a cada proveedor y empleado asignado', async () => {
    const { evento } = await crearEvento();
    const { id: planId } = await plan(evento, { presupuesto: 100000000 });
    const { body: prov } = await proveedor().expect(201);
    const s = sufijo();
    const { body: empleado } = await request(nucleo.url).post(`${LOG}/empleados`).set('Authorization', como(coordinador))
      .send({ usuarioId: randomUUID(), nombre: `Empleado ${s}`, rol: 'Sonido', credencial: `cred-${s}` }).expect(201);
    await request(nucleo.url).post(`${L}/planes/${planId}/proveedores`).set('Authorization', como(coordinador)).send({ proveedorId: prov.id }).expect(201);
    await request(nucleo.url).post(`${L}/planes/${planId}/personal`).set('Authorization', como(coordinador)).send({ empleadoId: empleado.id }).expect(201);

    const aprobado = await request(nucleo.url).post(`${L}/planes/${planId}/aprobar`).set('Authorization', como(coordinador)).send({}).expect(201);
    const tipos = aprobado.body.bitacora.map((b: { tipo: string }) => b.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['NOTIFICADO_PROVEEDOR', 'NOTIFICADO_PERSONAL', 'APROBADO']));
  });

  it('CU-016D: si el evento cambia de fecha, el cronograma se regenera solo', async () => {
    const { evento, inicio } = await crearEvento();
    const { id: planId } = await plan(evento);
    const antes = await detalle(planId);
    const inicioOriginal = antes.cronograma.find((c: { tipo: string }) => c.tipo === 'EVENTO').inicio;

    const nuevoInicio = new Date(inicio.getTime() + 48 * 3_600_000);
    const nuevoFin = new Date(nuevoInicio.getTime() + 5 * 3_600_000);
    await eventos.query('UPDATE eventos SET fecha_inicio = $2, fecha_fin = $3 WHERE id = $1', [evento, nuevoInicio, nuevoFin]);

    const despues = await detalle(planId);
    const inicioNuevo = despues.cronograma.find((c: { tipo: string }) => c.tipo === 'EVENTO').inicio;
    expect(new Date(inicioNuevo).getTime()).not.toBe(new Date(inicioOriginal).getTime());
    expect(new Date(inicioNuevo).getTime()).toBe(nuevoInicio.getTime());
    expect(despues.bitacora.some((b: { tipo: string }) => b.tipo === 'CRONOGRAMA_ACTUALIZADO')).toBe(true);
  });
});
