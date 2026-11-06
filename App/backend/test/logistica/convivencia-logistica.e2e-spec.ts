const { base: basePruebas, opcionesPg } = require('../base-unica/conexiones.cjs');
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Empleado } from '../../modulos/personal-logistica/turnos-asistencia/entities/empleado.entity';
import { JEFE_DE_PERSONAL } from '../../modulos/personal-logistica/turnos-asistencia/turnos-asistencia.constants';
import { NucleoPrueba, esperar } from './nucleo-prueba';

describe('Convivencia de Personal/Logística con Identidad y Alimentos en Núcleo', () => {
  let nucleo: NucleoPrueba;
  let jefe: { id: string; token: string };
  let personal: { id: string; token: string };
  let otro: { id: string; token: string };
  let empleado: Empleado;
  let empleadoAjeno: Empleado;
  let turnoId: string;
  let turnoAjenoId: string;
  const rol = `entrada-${randomUUID()}`;
  const RUTA = '/api/v1/logistica';
  const cabecera = (cuenta: { token: string }) => `Bearer ${cuenta.token}`;

  beforeAll(async () => {
    nucleo = new NucleoPrueba('convivencia-logistica');
    await nucleo.iniciar();
    jefe = await nucleo.cuenta(); personal = await nucleo.cuenta(); otro = await nucleo.cuenta();
    // Solo la ficha inicial del jefe es fixture: el resto se administra por HTTP.
    await nucleo.datos.getRepository(Empleado).save({ usuarioId: jefe.id, nombre: 'Jefatura fixture',
      rol: JEFE_DE_PERSONAL, credencial: `jefe-${randomUUID()}` });
  });
  afterAll(async () => { await nucleo?.cerrar(); });

  it('login real Personal permite perfil y ficha; el jefe supervisa sin rol Administrador', async () => {
    for (const cuenta of [personal, otro]) {
      const creada = await request(nucleo.url).post(`${RUTA}/empleados`).set('Authorization', cabecera(jefe))
        .send({ usuarioId: cuenta.id, nombre: 'Personal convivencia', rol, credencial: `cred-${randomUUID()}` }).expect(201);
      if (cuenta === personal) empleado = creada.body as Empleado;
      else empleadoAjeno = creada.body as Empleado;
    }
    const perfil = await request(nucleo.url).get('/api/v1/cuentas/perfil').set('Authorization', cabecera(personal)).expect(200);
    expect(perfil.body.id).toBe(personal.id);
    const ficha = await request(nucleo.url).get(`${RUTA}/empleados/yo`).set('Authorization', cabecera(personal)).expect(200);
    expect(ficha.body.empleado.id).toBe(empleado.id);
    expect(ficha.body.empleado.usuarioId).toBe(perfil.body.id);
    await request(nucleo.url).get('/api/v1/admin/cuentas').set('Authorization', cabecera(jefe)).expect(403);
    await request(nucleo.url).get(`${RUTA}/empleados`).set('Authorization', cabecera(personal)).expect(403);
  });

  it('asigna personal y persiste la notificación recibida por RabbitMQ en su base', async () => {
    const zona = await request(nucleo.url).post(`${RUTA}/zonas`).set('Authorization', cabecera(jefe))
      .send({ eventoId: `convivencia-${randomUUID()}`, nombre: 'Puerta convivencia', rolRequerido: rol, personalRequerido: 2 }).expect(201);
    const inicio = new Date(Date.now() + 3600000), fin = new Date(inicio.getTime() + 3600000);
    for (const ficha of [empleado, empleadoAjeno]) {
      const asignacion = await request(nucleo.url).post(`${RUTA}/zonas/${zona.body.id}/asignaciones`)
        .set('Authorization', cabecera(jefe)).send({ empleadoId: ficha.id, horaInicio: inicio.toISOString(), horaFin: fin.toISOString() }).expect(201);
      if (ficha === empleado) turnoId = asignacion.body.turno.id as string;
      else turnoAjenoId = asignacion.body.turno.id as string;
    }
    await esperar(async () => (await nucleo.datos.query('SELECT id FROM notificaciones WHERE "turnoId"=$1', [turnoId])).length === 1);
    const notificaciones = await request(nucleo.url).get(`${RUTA}/notificaciones`).set('Authorization', cabecera(jefe)).expect(200);
    expect(notificaciones.body).toEqual(expect.arrayContaining([expect.objectContaining({ turnoId, empleadoId: empleado.id, tipo: 'PERSONAL_ASIGNADO' })]));
  });

  it('restringe turnos, solicitudes y fichajes ajenos sin conceder supervisión genérica', async () => {
    const propios = await request(nucleo.url).get(`${RUTA}/turnos`).set('Authorization', cabecera(personal)).expect(200);
    expect(propios.body.map((t: { id: string }) => t.id)).toContain(turnoId);
    expect(propios.body.map((t: { id: string }) => t.id)).not.toContain(turnoAjenoId);
    const prohibida = await request(nucleo.url).post(`${RUTA}/turnos/${turnoAjenoId}/solicitudes-cambio`)
      .set('Authorization', cabecera(personal)).send({ motivo: 'Intento sobre turno ajeno' }).expect(403);
    expect(prohibida.body.codigo).toBe('TURNO_AJENO');
    for (const ficha of [empleado, empleadoAjeno]) {
      await request(nucleo.url).post(`${RUTA}/asistencia/entrada`).set('Authorization', cabecera(jefe))
        .send({ credencial: ficha.credencial }).expect(201);
    }
    const asistencia = await request(nucleo.url).get(`${RUTA}/asistencia`).set('Authorization', cabecera(personal)).expect(200);
    expect(asistencia.body.map((a: { empleadoId: string }) => a.empleadoId)).toContain(empleado.id);
    expect(asistencia.body.map((a: { empleadoId: string }) => a.empleadoId)).not.toContain(empleadoAjeno.id);
  });

  it('usa las tres bases correctas y conserva nueve migraciones (cuatro de logística con CU-007 y CU-008/009), sin synchronize', async () => {
    const conexiones = await nucleo.datos.query(`SELECT DISTINCT application_name,datname FROM pg_stat_activity WHERE application_name LIKE 'nucleo-%'`);
    expect(conexiones).toEqual(expect.arrayContaining([
      { application_name: 'nucleo-identidad', datname: basePruebas },
      { application_name: 'nucleo-alimentos', datname: basePruebas },
      { application_name: 'nucleo-personal-logistica', datname: basePruebas },
    ]));
    const cantidades: number[] = [];
    for (const fuente of [nucleo.identidad, nucleo.alimentos, nucleo.datos]) {
      expect(fuente.options.synchronize).toBe(false);
      cantidades.push((await fuente.query('SELECT count(*)::int AS n FROM migraciones'))[0].n as number);
    }
    expect(cantidades).toEqual([3, 2, 4]);
    expect((await nucleo.identidad.query("SELECT to_regclass('identidad.empleados') AS tabla"))[0].tabla).toBeNull();
    expect((await nucleo.alimentos.query("SELECT to_regclass('alimentos.empleados') AS tabla"))[0].tabla).toBeNull();
  });

  it('logout real revoca inmediatamente el acceso a ficha, turnos y perfil', async () => {
    await request(nucleo.url).delete('/api/v1/sesiones/actual').set('Authorization', cabecera(personal)).expect(200);
    for (const ruta of [`${RUTA}/empleados/yo`, `${RUTA}/turnos`, '/api/v1/cuentas/perfil']) {
      await request(nucleo.url).get(ruta).set('Authorization', cabecera(personal)).expect(401);
    }
  });
});
