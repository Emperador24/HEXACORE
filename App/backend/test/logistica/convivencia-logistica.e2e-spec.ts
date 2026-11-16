const { base: basePruebas, opcionesPg } = require('../base-unica/conexiones.cjs');
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Empleado } from '../../modulos/personal-logistica/turnos-asistencia/entities/empleado.entity';
import { JEFE_DE_PERSONAL } from '../../modulos/personal-logistica/turnos-asistencia/turnos-asistencia.constants';
import { NucleoPrueba, esperar } from './nucleo-prueba';
import { GRUPOS_MIGRACIONES } from '../../compartido/persistencia/historia';

describe('Convivencia de Personal/Logística con Identidad y Alimentos en Núcleo', () => {
  let nucleo: NucleoPrueba;
  let jefe: { id: string; token: string };
  let personal: { id: string; token: string };
  let otro: { id: string; token: string };
  let cliente: { id: string; token: string };
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
    cliente = await nucleo.cuenta(['Cliente']);
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

  it('notificaciones: el destinatario y el supervisor ven la existente; otro empleado y un Cliente no', async () => {
    await esperar(async () => (await nucleo.datos.query('SELECT id FROM notificaciones WHERE "turnoId"=$1', [turnoAjenoId])).length === 1);
    const propias = await request(nucleo.url).get(`${RUTA}/notificaciones`).set('Authorization', cabecera(personal)).expect(200);
    expect(propias.body).toEqual(expect.arrayContaining([expect.objectContaining({ turnoId })]));
    expect(propias.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ turnoId: turnoAjenoId })]));
    const ajenas = await request(nucleo.url).get(`${RUTA}/notificaciones`).set('Authorization', cabecera(otro))
      .set('X-Usuario-Id', personal.id).set('X-Usuario-Roles', 'Administrador').expect(200);
    expect(ajenas.body).toEqual(expect.arrayContaining([expect.objectContaining({ turnoId: turnoAjenoId })]));
    expect(ajenas.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ turnoId })]));
    const sinFicha = await request(nucleo.url).get(`${RUTA}/notificaciones`).set('Authorization', cabecera(cliente)).expect(200);
    expect(sinFicha.body).toEqual([]);
    const supervision = await request(nucleo.url).get(`${RUTA}/notificaciones`).set('Authorization', cabecera(jefe)).expect(200);
    expect(supervision.body).toEqual(expect.arrayContaining([expect.objectContaining({ turnoId }), expect.objectContaining({ turnoId: turnoAjenoId })]));
  });

  it('un Cliente no escribe fichajes con una credencial válida; un punto de control Personal conserva su operación', async () => {
    for (const operacion of ['entrada', 'salida']) {
      const idempotencyKey = randomUUID();
      const datos = { credencial: empleado.credencial, idempotencyKey };
      await request(nucleo.url).post(`${RUTA}/asistencia/${operacion}`).set('Authorization', cabecera(cliente)).send(datos).expect(403);
      expect((await nucleo.datos.query('SELECT id FROM registros_asistencia WHERE "idempotencyKey"=$1', [idempotencyKey])).length).toBe(0);
      await request(nucleo.url).post(`${RUTA}/asistencia/${operacion}`).set('Authorization', cabecera(personal)).send(datos).expect(201);
      expect((await nucleo.datos.query('SELECT id FROM registros_asistencia WHERE "idempotencyKey"=$1', [idempotencyKey])).length).toBe(1);
    }
  });

  it('usa la base y el esquema propios de cada pool, con sus nombres e historial de migraciones, sin synchronize', async () => {
    const conexiones = await nucleo.datos.query(`SELECT DISTINCT application_name,datname FROM pg_stat_activity WHERE application_name LIKE 'nucleo-%'`);
    expect(conexiones).toEqual(expect.arrayContaining([
      { application_name: 'nucleo-identidad', datname: basePruebas },
      { application_name: 'nucleo-alimentos', datname: basePruebas },
      { application_name: 'nucleo-personal-logistica', datname: basePruebas },
    ]));
    for (const [fuente, conexion] of [[nucleo.identidad, 'identidad'], [nucleo.alimentos, 'alimentos'],
      [nucleo.datos, 'personal-logistica']] as const) {
      const grupo = GRUPOS_MIGRACIONES.find(g => g.conexion === conexion)!;
      expect(fuente.options.synchronize).toBe(false);
      expect(fuente.options.database).toBe(basePruebas);
      expect((fuente.options as { schema?: string }).schema).toBe(grupo.esquema);
      const [sesion] = await fuente.query('SELECT current_schema() AS esquema');
      expect(sesion.esquema).toBe(grupo.esquema);
      const historial = await fuente.query(`SELECT name,"timestamp"::text AS marca FROM "${grupo.esquema}"."${grupo.historial}" ORDER BY "timestamp"`);
      const esperado = grupo.migraciones.map(M => {
        const name = (new M() as { name?: string }).name || M.name;
        return { name, marca: name.slice(-13) };
      }).sort((a,b) => a.marca.localeCompare(b.marca));
      expect(historial).toEqual(esperado);
    }
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
