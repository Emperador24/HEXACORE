import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { NucleoPrueba, esperar } from './nucleo-prueba';

/**
 * CU-008 · Gestionar cambios de turno y CU-009 · Registrar ingreso y salida
 * del personal, contra el Núcleo compilado y con cuentas reales: el empleado
 * pide y cancela desde su sesión, el supervisor elige el reemplazo y el
 * reemplazo responde desde la suya.
 */
describe('CU-008 y CU-009 · Cambios de turno y asistencia (e2e)', () => {
  let nucleo: NucleoPrueba;
  let supervisor: { id: string; token: string };
  const RUTA = '/api/v1/logistica';
  const como = (cuenta: { token: string }) => `Bearer ${cuenta.token}`;
  const sufijo = () => randomUUID().slice(0, 8);
  const HORA = 3_600_000, MINUTO = 60_000;

  beforeAll(async () => {
    nucleo = new NucleoPrueba('cambios-asistencia');
    await nucleo.iniciar();
    supervisor = await nucleo.cuenta(['Organizador']);
  });
  afterAll(async () => { await nucleo?.cerrar(); });

  /** Un empleado con su propia cuenta, para actuar desde su sesión. */
  async function empleado(rol: string) {
    const cuenta = await nucleo.cuenta();
    const s = sufijo();
    const res = await request(nucleo.url).post(`${RUTA}/empleados`).set('Authorization', como(supervisor))
      .send({ usuarioId: cuenta.id, nombre: `Empleado ${s}`, rol, credencial: `cred-${s}` }).expect(201);
    return { ...(res.body as { id: string; credencial: string }), cuenta };
  }

  async function turno(empleadoId: string, inicio: number, fin: number, eventoId = `evento-${sufijo()}`) {
    const res = await request(nucleo.url).post(`${RUTA}/turnos`).set('Authorization', como(supervisor))
      .send({ empleadoId, eventoId, zona: 'Puerta Norte', horaInicio: new Date(inicio).toISOString(), horaFin: new Date(fin).toISOString() })
      .expect(201);
    return res.body as { id: string; eventoId: string };
  }

  const turnoFuturo = (empleadoId: string) => turno(empleadoId, Date.now() + 2 * HORA, Date.now() + 6 * HORA);

  async function solicitar(empleadoQuePide: { cuenta: { token: string } }, turnoId: string) {
    const res = await request(nucleo.url).post(`${RUTA}/turnos/${turnoId}/solicitudes-cambio`)
      .set('Authorization', como(empleadoQuePide.cuenta)).send({ motivo: 'Cita médica' }).expect(201);
    return res.body.solicitud as { id: string; estado: string; empleadoReemplazoId: string | null };
  }

  async function avisos(turnoId: string, tipo: string) {
    let encontrados: { tipo: string; empleadoId: string }[] = [];
    await esperar(async () => {
      const res = await request(nucleo.url).get(`${RUTA}/notificaciones`).set('Authorization', como(supervisor)).expect(200);
      encontrados = res.body.filter((n: { turnoId: string; tipo: string }) => n.turnoId === turnoId && n.tipo === tipo);
      return encontrados.length > 0;
    });
    return encontrados;
  }

  // --- CU-008 ---------------------------------------------------------------

  it('pasos 1-13: el supervisor elige el reemplazo, el turno pasa a él y queda el historial', async () => {
    const rol = `rol-${sufijo()}`;
    const titular = await empleado(rol), a = await empleado(rol), b = await empleado(rol);
    const t = await turnoFuturo(titular.id);
    // `a` ya trabaja a esa hora: no está disponible.
    await turno(a.id, Date.now() + 3 * HORA, Date.now() + 5 * HORA);

    const solicitud = await solicitar(titular, t.id);
    expect(solicitud).toMatchObject({ estado: 'PENDIENTE', empleadoReemplazoId: b.id });
    // Paso 4: el supervisor recibe el aviso.
    expect(await avisos(t.id, 'CAMBIO_SOLICITADO')).toHaveLength(1);

    // Paso 6: posibles reemplazos, con su disponibilidad y el porqué.
    const posibles = await request(nucleo.url).get(`${RUTA}/solicitudes-cambio/${solicitud.id}/reemplazos`)
      .set('Authorization', como(supervisor)).expect(200);
    expect(posibles.body.candidatos).toEqual([
      expect.objectContaining({ empleado: expect.objectContaining({ id: b.id }), disponible: true }),
      expect.objectContaining({ empleado: expect.objectContaining({ id: a.id }), disponible: false, motivo: expect.stringMatching(/se cruza/) }),
    ]);
    // Un empleado cualquiera no ve la lista.
    await request(nucleo.url).get(`${RUTA}/solicitudes-cambio/${solicitud.id}/reemplazos`).set('Authorization', como(titular.cuenta)).expect(403);

    // Paso 8: elegir a alguien ocupado no procede (consistencia: dos turnos a la vez).
    const ocupado = await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`)
      .set('Authorization', como(supervisor)).send({ aprobar: true, reemplazoId: a.id }).expect(409);
    expect(ocupado.body.codigo).toBe('REEMPLAZO_NO_DISPONIBLE');

    // Pasos 9-10.
    const aprobada = await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`)
      .set('Authorization', como(supervisor)).send({ aprobar: true, reemplazoId: b.id }).expect(200);
    expect(aprobada.body).toMatchObject({ estado: 'APROBADA', empleadoReemplazoId: b.id, empleadoSolicitanteId: titular.id,
      respuestaReemplazo: 'PENDIENTE', revisadoPorId: supervisor.id });
    expect(aprobada.body.turno).toMatchObject({ empleadoId: b.id, estado: 'CAMBIADO', confirmacion: 'PENDIENTE' });

    // Quien la pidió la sigue viendo aunque el turno ya sea del reemplazo; el
    // reemplazo la ve para responder; un candidato no elegido, no.
    const ids = async (c: { token: string }) =>
      (await request(nucleo.url).get(`${RUTA}/solicitudes-cambio`).set('Authorization', como(c)).expect(200)).body.map((x: { id: string }) => x.id);
    expect(await ids(titular.cuenta)).toContain(solicitud.id);
    expect(await ids(b.cuenta)).toContain(solicitud.id);
    expect(await ids(a.cuenta)).not.toContain(solicitud.id);

    // Pasos 11-12: avisos al original y al reemplazo.
    expect((await avisos(t.id, 'CAMBIO_APROBADO'))[0].empleadoId).toBe(titular.id);
    expect((await avisos(t.id, 'TURNO_CAMBIADO'))[0].empleadoId).toBe(b.id);

    // El reemplazo confirma desde su sesión; nadie más puede.
    await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/respuesta-reemplazo`)
      .set('Authorization', como(titular.cuenta)).send({ aceptar: true }).expect(403);
    const confirmada = await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/respuesta-reemplazo`)
      .set('Authorization', como(b.cuenta)).send({ aceptar: true }).expect(201);
    expect(confirmada.body).toMatchObject({ respuestaReemplazo: 'ACEPTADA', turno: { confirmacion: 'CONFIRMADA', empleadoId: b.id } });

    // El turno cambiado es ya el turno vigente/próximo del reemplazo, no del titular.
    const deB = await request(nucleo.url).get(`${RUTA}/turnos`).set('Authorization', como(b.cuenta)).expect(200);
    expect(deB.body.map((x: { id: string }) => x.id)).toContain(t.id);
    const delTitular = await request(nucleo.url).get(`${RUTA}/turnos`).set('Authorization', como(titular.cuenta)).expect(200);
    expect(delTitular.body.map((x: { id: string }) => x.id)).not.toContain(t.id);

    // Paso 13: historial auditable, en orden.
    const historial = await request(nucleo.url).get(`${RUTA}/solicitudes-cambio/${solicitud.id}/historial`)
      .set('Authorization', como(supervisor)).expect(200);
    expect(historial.body.eventos.map((e: { accion: string }) => e.accion)).toEqual(['CAMBIO_SOLICITADO', 'CAMBIO_APROBADO', 'REEMPLAZO_ACEPTO']);
    expect(historial.body.eventos[1]).toMatchObject({ realizadoPor: supervisor.id, detalle: { empleadoAnteriorId: titular.id, empleadoNuevoId: b.id, elegidoPorSupervisor: true } });
  });

  it('CU-008A: el supervisor rechaza con motivo, el turno sigue con su titular y se le avisa', async () => {
    const rol = `rol-${sufijo()}`;
    const titular = await empleado(rol);
    await empleado(rol);
    const t = await turnoFuturo(titular.id);
    const solicitud = await solicitar(titular, t.id);

    const rechazada = await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`)
      .set('Authorization', como(supervisor)).send({ aprobar: false, motivo: 'Ese día no hay cobertura' }).expect(200);
    expect(rechazada.body).toMatchObject({ estado: 'RECHAZADA', motivoRechazoOBloqueo: 'Ese día no hay cobertura', turno: { estado: 'ASIGNADO', empleadoId: titular.id } });
    const [aviso] = await avisos(t.id, 'CAMBIO_RECHAZADO');
    expect(aviso).toMatchObject({ empleadoId: titular.id, mensaje: expect.stringContaining('Ese día no hay cobertura') });
  });

  it('CU-008B: el empleado cancela su solicitud pendiente; ni otro puede, ni se cancela una ya revisada', async () => {
    const rol = `rol-${sufijo()}`;
    const titular = await empleado(rol), otro = await empleado(rol);
    const t = await turnoFuturo(titular.id);
    const solicitud = await solicitar(titular, t.id);

    await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/cancelar`).set('Authorization', como(otro.cuenta)).send({}).expect(403);
    const cancelada = await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/cancelar`)
      .set('Authorization', como(titular.cuenta)).send({ motivo: 'Ya lo resolví' }).expect(201);
    expect(cancelada.body).toMatchObject({ estado: 'CANCELADA', turno: { estado: 'ASIGNADO', empleadoId: titular.id } });
    await avisos(t.id, 'CAMBIO_CANCELADO');

    // Ya no se puede revisar ni volver a cancelar; sí pedir otro cambio.
    await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`).set('Authorization', como(supervisor)).send({ aprobar: true }).expect(400);
    const otraVez = await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/cancelar`).set('Authorization', como(titular.cuenta)).send({}).expect(409);
    expect(otraVez.body.codigo).toBe('SOLICITUD_YA_REVISADA');
    expect((await solicitar(titular, t.id)).estado).toBe('PENDIENTE');
  });

  it('CU-008C: si el reemplazo rechaza, el turno vuelve al titular y se propone a otro sin repetirlo', async () => {
    const rol = `rol-${sufijo()}`;
    const titular = await empleado(rol), primero = await empleado(rol), segundo = await empleado(rol);
    const t = await turnoFuturo(titular.id);
    const solicitud = await solicitar(titular, t.id);

    await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`)
      .set('Authorization', como(supervisor)).send({ aprobar: true, reemplazoId: primero.id }).expect(200);
    // Rechazar exige motivo.
    await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/respuesta-reemplazo`)
      .set('Authorization', como(primero.cuenta)).send({ aceptar: false }).expect(400);
    const rechazo = await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/respuesta-reemplazo`)
      .set('Authorization', como(primero.cuenta)).send({ aceptar: false, motivo: 'Tengo otro compromiso' }).expect(201);
    expect(rechazo.body).toMatchObject({
      estado: 'PENDIENTE', empleadoReemplazoId: segundo.id, reemplazosDescartados: [primero.id], respuestaReemplazo: null,
      turno: { empleadoId: titular.id, estado: 'CAMBIO_SOLICITADO' },
    });
    expect((await avisos(t.id, 'REEMPLAZO_RECHAZO'))[0].empleadoId).toBe(titular.id);

    // A quien ya dijo que no no se le puede volver a elegir.
    const repetido = await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`)
      .set('Authorization', como(supervisor)).send({ aprobar: true, reemplazoId: primero.id }).expect(409);
    expect(repetido.body.codigo).toBe('REEMPLAZO_NO_DISPONIBLE');

    // El segundo también rechaza: no queda nadie y el turno sigue siendo del titular.
    await request(nucleo.url).patch(`${RUTA}/solicitudes-cambio/${solicitud.id}/revisar`)
      .set('Authorization', como(supervisor)).send({ aprobar: true }).expect(200);
    const sinNadie = await request(nucleo.url).post(`${RUTA}/solicitudes-cambio/${solicitud.id}/respuesta-reemplazo`)
      .set('Authorization', como(segundo.cuenta)).send({ aceptar: false, motivo: 'No puedo' }).expect(201);
    expect(sinNadie.body).toMatchObject({ estado: 'SIN_REEMPLAZO', empleadoReemplazoId: null, turno: { empleadoId: titular.id, estado: 'ASIGNADO' } });
    expect(sinNadie.body.reemplazosDescartados.sort()).toEqual([primero.id, segundo.id].sort());

    const historial = await request(nucleo.url).get(`${RUTA}/solicitudes-cambio/${solicitud.id}/historial`)
      .set('Authorization', como(supervisor)).expect(200);
    expect(historial.body.eventos.map((e: { accion: string }) => e.accion))
      .toEqual(['CAMBIO_SOLICITADO', 'CAMBIO_APROBADO', 'REEMPLAZO_RECHAZO', 'CAMBIO_APROBADO', 'REEMPLAZO_RECHAZO']);
  });

  // --- CU-009 ---------------------------------------------------------------

  async function marcar(tipo: 'entrada' | 'salida', credencial: string, momento: number, eventoId?: string) {
    const res = await request(nucleo.url).post(`${RUTA}/asistencia/${tipo}`).set('Authorization', como(supervisor))
      .send({ credencial, clientTimestamp: new Date(momento).toISOString(), idempotencyKey: `cu009-${randomUUID()}`, ...(eventoId ? { eventoId } : {}) })
      .expect(201);
    return res.body;
  }

  it('CU-009A y C: entrada anticipada, salida posterior, horas calculadas y estado del empleado', async () => {
    const e = await empleado(`rol-${sufijo()}`);
    const inicio = Date.now() + 30 * MINUTO, fin = inicio + 2 * HORA;
    const t = await turno(e.id, inicio, fin);

    // 30 min antes del inicio: se acepta y se marca anticipada, sin anomalía.
    const entrada = await marcar('entrada', e.credencial, inicio - 25 * MINUTO, t.eventoId);
    expect(entrada).toMatchObject({ anomalia: false, turnoId: t.id, puntualidad: 'ANTICIPADA', minutosDesviacion: -25, estadoEmpleado: 'EN_TURNO' });
    const estado = await request(nucleo.url).get(`${RUTA}/asistencia/estado`).set('Authorization', como(e.cuenta)).expect(200);
    expect(estado.body.estado).toBe('EN_TURNO');

    // Más de una hora antes no hay turno contra el que registrarla (CU-018E).
    const otro = await empleado(`rol-${sufijo()}`);
    await turno(otro.id, inicio, fin);
    expect(await marcar('entrada', otro.credencial, inicio - 90 * MINUTO)).toMatchObject({ anomalia: true, turnoId: null });

    const salida = await marcar('salida', e.credencial, fin + 40 * MINUTO, t.eventoId);
    expect(salida).toMatchObject({ anomalia: false, puntualidad: 'POSTERIOR', minutosDesviacion: 40, estadoEmpleado: 'FUERA_DE_TURNO' });
    expect(salida.horasCalculadas).toBeCloseTo((2 * HORA + 65 * MINUTO) / HORA, 5);
  });

  it('CU-009B y C: entrada tardía, salida anticipada; reporte de horas para el supervisor', async () => {
    const rol = `rol-${sufijo()}`;
    const evento = `evento-${sufijo()}`;
    const tarde = await empleado(rol), puntual = await empleado(rol), ausente = await empleado(rol);
    const inicio = Date.now() - 3 * HORA, fin = Date.now() + HORA;
    await turno(tarde.id, inicio, fin, evento);
    await turno(puntual.id, inicio, fin, evento);
    await turno(ausente.id, inicio, fin, evento);

    expect(await marcar('entrada', tarde.credencial, inicio + 20 * MINUTO, evento)).toMatchObject({ puntualidad: 'TARDIA', minutosDesviacion: 20 });
    expect(await marcar('salida', tarde.credencial, inicio + 2 * HORA + 20 * MINUTO, evento)).toMatchObject({ puntualidad: 'ANTICIPADA', minutosDesviacion: -100 });
    expect(await marcar('entrada', puntual.credencial, inicio + 5 * MINUTO, evento)).toMatchObject({ puntualidad: 'A_TIEMPO' });

    // Solo el supervisor ve el reporte.
    await request(nucleo.url).get(`${RUTA}/asistencia/reporte`).set('Authorization', como(tarde.cuenta)).query({ eventoId: evento }).expect(403);
    await request(nucleo.url).get(`${RUTA}/asistencia/reporte`).set('Authorization', como(supervisor)).expect(400);
    const reporte = await request(nucleo.url).get(`${RUTA}/asistencia/reporte`).set('Authorization', como(supervisor)).query({ eventoId: evento }).expect(200);
    const fila = (id: string) => reporte.body.empleados.find((f: { empleadoId: string }) => f.empleadoId === id);
    expect(fila(tarde.id)).toMatchObject({ turnos: 1, horasProgramadas: 4, horasTrabajadas: 2, tardias: 1, salidasAnticipadas: 1, estado: 'FUERA_DE_TURNO' });
    expect(fila(puntual.id)).toMatchObject({ tardias: 0, horasTrabajadas: 0, estado: 'EN_TURNO' });
    expect(fila(ausente.id)).toMatchObject({ entradas: 0, estado: 'FUERA_DE_TURNO' });
    expect(reporte.body.totales).toMatchObject({ empleados: 3, enTurno: 1, horasProgramadas: 12, horasTrabajadas: 2, tardias: 1 });
  });

  it('CU-009: una entrada sobre un turno cancelado no cuenta como vigente', async () => {
    const e = await empleado(`rol-${sufijo()}`);
    const t = await turno(e.id, Date.now() - HORA, Date.now() + HORA);
    await request(nucleo.url).post(`${RUTA}/turnos/${t.id}/cancelar`).set('Authorization', como(supervisor)).send({ motivo: 'Evento reprogramado' }).expect(201);
    expect(await marcar('entrada', e.credencial, Date.now())).toMatchObject({ anomalia: true, turnoId: null, estadoEmpleado: 'FUERA_DE_TURNO' });
  });
});
