import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { NucleoPrueba, esperar } from './nucleo-prueba';

/**
 * CU-007 · Gestión de personal para eventos, contra el Núcleo compilado y con
 * cuentas reales: el organizador administra y asigna, el empleado responde
 * desde su propia sesión.
 */
describe('CU-007 · Gestión de personal para eventos (e2e)', () => {
  let nucleo: NucleoPrueba;
  let organizador: { id: string; token: string };
  let trabajador: { id: string; token: string };
  let otro: { id: string; token: string };
  const RUTA = '/api/v1/logistica';
  const como = (cuenta: { token: string }) => `Bearer ${cuenta.token}`;
  const sufijo = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    nucleo = new NucleoPrueba('gestion-personal');
    await nucleo.iniciar();
    organizador = await nucleo.cuenta(['Organizador']);
    trabajador = await nucleo.cuenta();
    otro = await nucleo.cuenta();
  });
  afterAll(async () => { await nucleo?.cerrar(); });

  async function alta(datos: Record<string, unknown> = {}, esperado = 201) {
    const s = sufijo();
    return request(nucleo.url).post(`${RUTA}/empleados`).set('Authorization', como(organizador))
      .send({ usuarioId: randomUUID(), nombre: `Empleado ${s}`, rol: 'Entrada', credencial: `cred-${s}`,
        documento: `DOC${s}`, correo: `Empleado.${s}@Example.test`, telefono: '+57 300 000 0000', ...datos })
      .expect(esperado);
  }

  async function zona(rolRequerido: string, personalRequerido = 1) {
    const res = await request(nucleo.url).post(`${RUTA}/zonas`).set('Authorization', como(organizador))
      .send({ eventoId: `evento-${randomUUID()}`, nombre: `Zona ${sufijo()}`, rolRequerido, personalRequerido }).expect(201);
    return res.body as { id: string; eventoId: string };
  }

  function ventana(desdeHoras = 2, horas = 4) {
    const inicio = new Date(Date.now() + desdeHoras * 3600000);
    return { horaInicio: inicio.toISOString(), horaFin: new Date(inicio.getTime() + horas * 3600000).toISOString() };
  }

  it('pasos 3-5: da de alta con documento, correo y teléfono; normaliza y audita', async () => {
    const res = await alta();
    expect(res.body).toMatchObject({ activo: true, telefono: '+57 300 000 0000' });
    expect(res.body.correo).toBe(res.body.correo.toLowerCase());
    const detalle = await request(nucleo.url).get(`${RUTA}/empleados/${res.body.id}`).set('Authorization', como(organizador)).expect(200);
    expect(detalle.body.empleado.id).toBe(res.body.id);
    expect(detalle.body.auditoria).toEqual([expect.objectContaining({ accion: 'EMPLEADO_CREADO', realizadoPor: organizador.id })]);
  });

  it('paso 4: rechaza documento o correo repetidos e indica el campo', async () => {
    const primero = (await alta()).body;
    const porDocumento = await alta({ documento: primero.documento }, 409);
    expect(porDocumento.body).toMatchObject({ codigo: 'EMPLEADO_DUPLICADO', campo: 'documento' });
    const porCorreo = await alta({ correo: primero.correo.toUpperCase() }, 409);
    expect(porCorreo.body).toMatchObject({ codigo: 'EMPLEADO_DUPLICADO', campo: 'correo' });
    await alta({ correo: 'no-es-correo' }, 400);
  });

  it('paso 3: actualiza solo lo enviado y guarda antes/después; no pisa datos de otro', async () => {
    const empleado = (await alta()).body, ajeno = (await alta()).body;
    const res = await request(nucleo.url).patch(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(organizador))
      .send({ telefono: '+57 311 111 1111' }).expect(200);
    expect(res.body).toMatchObject({ telefono: '+57 311 111 1111', nombre: empleado.nombre });
    const choque = await request(nucleo.url).patch(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(organizador))
      .send({ documento: ajeno.documento }).expect(409);
    expect(choque.body.campo).toBe('documento');
    const detalle = await request(nucleo.url).get(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(organizador)).expect(200);
    expect(detalle.body.auditoria[0]).toMatchObject({ accion: 'EMPLEADO_ACTUALIZADO',
      detalle: { cambios: { telefono: { antes: '+57 300 000 0000', despues: '+57 311 111 1111' } } } });
  });

  it('pasos 6-11: candidatos con su disponibilidad y asignación que deja rastro', async () => {
    const rol = `rol-${sufijo()}`;
    const libre = (await alta({ rol })).body, ocupado = (await alta({ rol })).body;
    const z = await zona(rol, 2), horario = ventana();
    await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: ocupado.id, ...horario }).expect(201);

    const candidatos = await request(nucleo.url).get(`${RUTA}/zonas/${z.id}/candidatos`).set('Authorization', como(organizador))
      .query(horario).expect(200);
    expect(candidatos.body).toEqual([
      expect.objectContaining({ empleado: expect.objectContaining({ id: libre.id }), disponible: true, motivo: null }),
      expect.objectContaining({ empleado: expect.objectContaining({ id: ocupado.id }), disponible: false }),
    ]);

    const asignado = await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: libre.id, ...horario }).expect(201);
    expect(asignado.body.turno.confirmacion).toBe('PENDIENTE');
    const asignaciones = await request(nucleo.url).get(`${RUTA}/asignaciones`).set('Authorization', como(organizador))
      .query({ eventoId: z.eventoId }).expect(200);
    expect(asignaciones.body).toHaveLength(2);
    const auditoria = await nucleo.datos.query('SELECT accion,"realizadoPor" FROM auditoria_personal WHERE "turnoId"=$1', [asignado.body.turno.id]);
    expect(auditoria).toEqual([{ accion: 'PERSONAL_ASIGNADO', realizadoPor: organizador.id }]);
  });

  it('precondición 2: no asigna a un empleado desactivado', async () => {
    const rol = `rol-${sufijo()}`;
    const empleado = (await alta({ rol })).body, z = await zona(rol);
    await request(nucleo.url).post(`${RUTA}/empleados/${empleado.id}/desactivar`).set('Authorization', como(organizador))
      .send({ motivo: 'Fin de contrato' }).expect(201);
    await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: empleado.id, ...ventana() }).expect(400);
  });

  it('paso 13: el empleado confirma su asignación desde su sesión; nadie más puede', async () => {
    const rol = `rol-${sufijo()}`;
    const ficha = (await alta({ rol, usuarioId: trabajador.id })).body;
    await alta({ rol, usuarioId: otro.id });
    const z = await zona(rol);
    const turno = (await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: ficha.id, ...ventana() }).expect(201)).body.turno;

    await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/respuesta`).set('Authorization', como(otro))
      .send({ aceptar: true }).expect(403);
    await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/respuesta`).set('Authorization', como(organizador))
      .send({ aceptar: true }).expect(403);
    const res = await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/respuesta`).set('Authorization', como(trabajador))
      .send({ aceptar: true }).expect(201);
    expect(res.body).toMatchObject({ confirmacion: 'CONFIRMADA', estado: 'ASIGNADO' });
    await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/respuesta`).set('Authorization', como(trabajador))
      .send({ aceptar: false, motivo: 'Cambié de idea' }).expect(409);
  });

  it('CU-007B y CU-007C: el rechazo libera el puesto y el organizador asigna a otro', async () => {
    const rol = `rol-${sufijo()}`;
    const quienRechaza = await nucleo.cuenta();
    const ficha = (await alta({ rol, usuarioId: quienRechaza.id })).body, sustituto = (await alta({ rol })).body;
    const z = await zona(rol), horario = ventana();
    const turno = (await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: ficha.id, ...horario }).expect(201)).body.turno;

    await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/respuesta`).set('Authorization', como(quienRechaza))
      .send({ aceptar: false }).expect(400);
    const rechazo = await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/respuesta`).set('Authorization', como(quienRechaza))
      .send({ aceptar: false, motivo: 'Tengo otro compromiso' }).expect(201);
    expect(rechazo.body).toMatchObject({ confirmacion: 'RECHAZADA', estado: 'CANCELADO', motivoRechazo: 'Tengo otro compromiso' });
    const zonas = await request(nucleo.url).get(`${RUTA}/zonas`).set('Authorization', como(organizador)).query({ eventoId: z.eventoId }).expect(200);
    expect(zonas.body[0]).toMatchObject({ personalAsignado: 0, deficit: true });
    await esperar(async () => (await nucleo.datos.query(
      `SELECT id FROM notificaciones WHERE "turnoId"=$1 AND tipo='ASIGNACION_RECHAZADA'`, [turno.id])).length === 1);

    const reasignado = await request(nucleo.url).patch(`${RUTA}/turnos/${turno.id}/reasignar`).set('Authorization', como(organizador))
      .send({ empleadoId: sustituto.id, ...horario }).expect(200);
    expect(reasignado.body.turno).toMatchObject({ empleadoId: sustituto.id, estado: 'ASIGNADO', confirmacion: 'PENDIENTE', motivoRechazo: null });
  });

  it('CU-007A: desactivar cancela sus turnos futuros, impide cambiar el rol con asignaciones y se puede revertir', async () => {
    const rol = `rol-${sufijo()}`;
    const empleado = (await alta({ rol })).body, z = await zona(rol);
    const turno = (await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: empleado.id, ...ventana() }).expect(201)).body.turno;

    const cambioRol = await request(nucleo.url).patch(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(organizador))
      .send({ rol: 'Otro rol' }).expect(409);
    expect(cambioRol.body.codigo).toBe('ROL_CON_ASIGNACIONES');

    await request(nucleo.url).post(`${RUTA}/empleados/${empleado.id}/desactivar`).set('Authorization', como(organizador)).send({}).expect(400);
    const baja = await request(nucleo.url).post(`${RUTA}/empleados/${empleado.id}/desactivar`).set('Authorization', como(organizador))
      .send({ motivo: 'Renuncia' }).expect(201);
    expect(baja.body).toMatchObject({ empleado: { activo: false }, turnosCancelados: 1 });
    const [fila] = await nucleo.datos.query('SELECT estado FROM turnos WHERE id=$1', [turno.id]);
    expect(fila.estado).toBe('CANCELADO');
    await request(nucleo.url).post(`${RUTA}/empleados/${empleado.id}/desactivar`).set('Authorization', como(organizador))
      .send({ motivo: 'Otra vez' }).expect(409);

    const alta2 = await request(nucleo.url).post(`${RUTA}/empleados/${empleado.id}/reactivar`).set('Authorization', como(organizador)).expect(201);
    expect(alta2.body.activo).toBe(true);
    const detalle = await request(nucleo.url).get(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(organizador)).expect(200);
    expect(detalle.body.auditoria.map((a: { accion: string }) => a.accion)).toEqual(
      ['EMPLEADO_REACTIVADO', 'EMPLEADO_DESACTIVADO', 'PERSONAL_ASIGNADO', 'EMPLEADO_CREADO']);
  });

  it('CU-007C: al cambiar el horario, el turno que se modifica no choca consigo mismo', async () => {
    const rol = `rol-${sufijo()}`;
    const empleado = (await alta({ rol })).body, z = await zona(rol), horario = ventana(2, 4);
    const turno = (await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: empleado.id, ...horario }).expect(201)).body.turno;
    const otroHorario = ventana(3, 4);
    const sinExcluir = await request(nucleo.url).get(`${RUTA}/zonas/${z.id}/candidatos`).set('Authorization', como(organizador))
      .query(otroHorario).expect(200);
    expect(sinExcluir.body[0]).toMatchObject({ disponible: false });
    const excluyendo = await request(nucleo.url).get(`${RUTA}/zonas/${z.id}/candidatos`).set('Authorization', como(organizador))
      .query({ ...otroHorario, excluirTurnoId: turno.id }).expect(200);
    expect(excluyendo.body[0]).toMatchObject({ disponible: true, motivo: null });
    await request(nucleo.url).get(`${RUTA}/zonas/${z.id}/candidatos`).set('Authorization', como(organizador))
      .query({ ...otroHorario, excluirTurnoId: 'no-es-uuid' }).expect(400);
  });

  it('CU-007C: el organizador cancela una asignación con motivo', async () => {
    const rol = `rol-${sufijo()}`;
    const empleado = (await alta({ rol })).body, z = await zona(rol);
    const turno = (await request(nucleo.url).post(`${RUTA}/zonas/${z.id}/asignaciones`).set('Authorization', como(organizador))
      .send({ empleadoId: empleado.id, ...ventana() }).expect(201)).body.turno;
    const res = await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/cancelar`).set('Authorization', como(organizador))
      .send({ motivo: 'Se cerró la zona' }).expect(201);
    expect(res.body.estado).toBe('CANCELADO');
    await request(nucleo.url).post(`${RUTA}/turnos/${turno.id}/cancelar`).set('Authorization', como(organizador))
      .send({ motivo: 'Otra vez' }).expect(409);
  });

  it('seguridad: un empleado sin jefatura no administra ni consulta fichas ajenas', async () => {
    const empleado = (await alta()).body;
    await request(nucleo.url).get(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(otro)).expect(403);
    await request(nucleo.url).patch(`${RUTA}/empleados/${empleado.id}`).set('Authorization', como(otro)).send({ nombre: 'X' }).expect(403);
    await request(nucleo.url).post(`${RUTA}/empleados/${empleado.id}/desactivar`).set('Authorization', como(otro)).send({ motivo: 'X' }).expect(403);
    await request(nucleo.url).get(`${RUTA}/empleados/yo`).set('Authorization', como(otro)).expect(200);
  });
});
