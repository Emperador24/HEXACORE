import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { SesionValida } from './../src/comun/autenticacion/sesion-valida.guard.js';

/**
 * Sesión con la que corren estas pruebas.
 *
 * Son pruebas del **dominio** —horas máximas, búsqueda de reemplazo, anomalías
 * de asistencia—, no de la autenticación: esa se comprueba de extremo a extremo
 * en `App/gateway/pruebas/gateway.py`, contra el sistema entero. Aquí se
 * sustituye el guard para no tener que firmar un token en cada petición.
 *
 * El rol es Administrador porque varias operaciones lo exigen (dar de alta a un
 * empleado, revisar una solicitud).
 */
const SESION_DE_PRUEBA = {
  usuarioId: '00000000-0000-4000-8000-000000000001',
  roles: ['Administrador'],
  jti: '00000000-0000-4000-8000-0000000000ff',
};

describe('CU-LOG-003 · Gestionar turno y asistencia del personal (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(SesionValida)
      .useValue({
        canActivate: (contexto: ExecutionContext) => {
          contexto.switchToHttp().getRequest().sesion = SESION_DE_PRUEBA;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function crearEmpleado(rol = 'seguridad') {
    const credencial = `cred-${randomUUID()}`;
    const res = await request(server)
      .post('/empleados')
      .send({ usuarioId: randomUUID(), nombre: `Empleado ${credencial}`, rol, credencial })
      .expect(201);
    return res.body as { id: string; credencial: string };
  }

  async function crearTurno(
    empleadoId: string,
    opts: { horaInicio: Date; horaFin: Date; zona?: string },
  ) {
    const res = await request(server)
      .post('/turnos')
      .send({
        empleadoId,
        eventoId: `evento-${randomUUID()}`,
        zona: opts.zona ?? 'zona-norte',
        horaInicio: opts.horaInicio.toISOString(),
        horaFin: opts.horaFin.toISOString(),
      })
      .expect(201);
    return res.body as { id: string; empleadoId: string };
  }

  function turnoVigente(horas = 4) {
    const ahora = Date.now();
    return {
      horaInicio: new Date(ahora - 60 * 60 * 1000),
      horaFin: new Date(ahora + horas * 60 * 60 * 1000),
    };
  }

  // --- Flujo básico de éxito: pasos 1-4 ---

  it('solicita un cambio de turno y encuentra reemplazo disponible (pasos 1-2)', async () => {
    const solicitante = await crearEmpleado('seguridad');
    await crearEmpleado('seguridad');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const res = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Cita médica' })
      .expect(201);

    expect(res.body.solicitud.estado).toBe('PENDIENTE');
    expect(res.body.solicitud.empleadoReemplazoId).toBeTruthy();
  });

  it('el supervisor aprueba el cambio y el turno se reasigna (pasos 3-4)', async () => {
    const solicitante = await crearEmpleado('logistica');
    await crearEmpleado('logistica');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Emergencia familiar' })
      .expect(201);

    const revisada = await request(server)
      .patch(`/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .send({ aprobar: true })
      .expect(200);

    expect(revisada.body.estado).toBe('APROBADA');
    // Regresión: la respuesta del PATCH debe traer el turno YA actualizado
    // (empleado reasignado, estado CAMBIADO), no el estado previo a la
    // reasignación — ver corrección de `solicitud.turno` en turnos.service.
    expect(revisada.body.turno.estado).toBe('CAMBIADO');
    expect(revisada.body.turno.empleadoId).not.toBe(solicitante.id);
    expect(revisada.body.turno.empleado.id).toBe(revisada.body.turno.empleadoId);

    const turnos = await request(server).get('/turnos').expect(200);
    const turnoActualizado = turnos.body.find((t: any) => t.id === turno.id);
    expect(turnoActualizado.estado).toBe('CAMBIADO');
    expect(turnoActualizado.empleadoId).not.toBe(solicitante.id);
  });

  // --- GET /solicitudes-cambio (listado usado por la revisión del supervisor) ---

  it('lista las solicitudes de cambio y filtra por estado', async () => {
    const solicitante = await crearEmpleado('listado');
    await crearEmpleado('listado');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Prueba de listado' })
      .expect(201);
    const solicitudId = solicitud.body.solicitud.id as string;

    const todas = await request(server).get('/solicitudes-cambio').expect(200);
    expect(todas.body.some((s: any) => s.id === solicitudId)).toBe(true);

    const pendientes = await request(server)
      .get('/solicitudes-cambio')
      .query({ estado: 'PENDIENTE' })
      .expect(200);
    expect(pendientes.body.some((s: any) => s.id === solicitudId)).toBe(true);
    expect(pendientes.body.every((s: any) => s.estado === 'PENDIENTE')).toBe(true);

    await request(server)
      .patch(`/solicitudes-cambio/${solicitudId}/revisar`)
      .send({ aprobar: true })
      .expect(200);

    const pendientesLuego = await request(server)
      .get('/solicitudes-cambio')
      .query({ estado: 'PENDIENTE' })
      .expect(200);
    expect(pendientesLuego.body.some((s: any) => s.id === solicitudId)).toBe(false);

    const aprobadas = await request(server)
      .get('/solicitudes-cambio')
      .query({ estado: 'APROBADA' })
      .expect(200);
    expect(aprobadas.body.some((s: any) => s.id === solicitudId)).toBe(true);
  });

  // --- Infraestructura no trivial: cola de mensajes (Publicador de Eventos) ---

  it('propaga el cambio de turno aprobado por la cola de mensajes y queda como Notificacion', async () => {
    const solicitante = await crearEmpleado('mensajeria');
    await crearEmpleado('mensajeria');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Prueba de mensajería' })
      .expect(201);

    await request(server)
      .patch(`/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .send({ aprobar: true })
      .expect(200);

    // El consumidor procesa de forma asíncrona; se sondea hasta 5s.
    let notificacion: any;
    for (let intento = 0; intento < 25 && !notificacion; intento++) {
      const res = await request(server).get('/notificaciones').expect(200);
      notificacion = res.body.find((n: any) => n.turnoId === turno.id);
      if (!notificacion) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    expect(notificacion).toBeTruthy();
    expect(notificacion.tipo).toBe('TURNO_CAMBIADO');
    expect(notificacion.latenciaMs).toBeGreaterThanOrEqual(0);
  });

  // --- Infraestructura no trivial: offline-first (idempotencia + hora del cliente) ---

  it('un registro offline con idempotencyKey no se duplica al reintentar la sincronización', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());
    const idempotencyKey = `offline-${randomUUID()}`;
    const horaEventoOffline = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const primerIntento = await request(server)
      .post('/asistencia/entrada')
      .send({
        credencial: empleado.credencial,
        clientTimestamp: horaEventoOffline,
        idempotencyKey,
      })
      .expect(201);

    // El dispositivo reintenta el envío (misma clave) al recuperar señal.
    const reintento = await request(server)
      .post('/asistencia/entrada')
      .send({
        credencial: empleado.credencial,
        clientTimestamp: horaEventoOffline,
        idempotencyKey,
      })
      .expect(201);

    expect(reintento.body.id).toBe(primerIntento.body.id);
    expect(new Date(primerIntento.body.timestamp).toISOString()).toBe(horaEventoOffline);

    const registros = await request(server).get('/asistencia').expect(200);
    const coincidencias = registros.body.filter(
      (r: any) => r.idempotencyKey === idempotencyKey,
    );
    expect(coincidencias).toHaveLength(1);
  });

  it('404 al crear un turno para un empleado inexistente', async () => {
    const { horaInicio, horaFin } = turnoVigente();
    await request(server)
      .post('/turnos')
      .send({
        empleadoId: randomUUID(),
        eventoId: 'evento-x',
        zona: 'zona-x',
        horaInicio: horaInicio.toISOString(),
        horaFin: horaFin.toISOString(),
      })
      .expect(404);
  });

  it('404 al solicitar un cambio sobre un turno inexistente', async () => {
    await request(server)
      .post(`/turnos/${randomUUID()}/solicitudes-cambio`)
      .send({ motivo: 'Turno inexistente' })
      .expect(404);
  });

  it('lista los empleados registrados', async () => {
    await crearEmpleado('inventario');
    const res = await request(server).get('/empleados').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('rechaza solicitar un cambio si el turno ya tiene un cambio en curso', async () => {
    const solicitante = await crearEmpleado('doble-solicitud');
    await crearEmpleado('doble-solicitud');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Primera solicitud' })
      .expect(201);

    await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Segunda solicitud, turno ya en trámite' })
      .expect(400);
  });

  it('404 al revisar una solicitud de cambio inexistente', async () => {
    await request(server)
      .patch(`/solicitudes-cambio/${randomUUID()}/revisar`)
      .send({ aprobar: true })
      .expect(404);
  });

  it('rechaza revisar dos veces la misma solicitud ya resuelta', async () => {
    const solicitante = await crearEmpleado('doble-revision');
    await crearEmpleado('doble-revision');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Revisión única' })
      .expect(201);

    await request(server)
      .patch(`/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .send({ aprobar: false })
      .expect(200);

    await request(server)
      .patch(`/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .send({ aprobar: true })
      .expect(400);
  });

  it('un registro de salida offline con idempotencyKey no se duplica al reintentar', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());
    const idempotencyKey = `offline-salida-${randomUUID()}`;

    await request(server)
      .post('/asistencia/entrada')
      .send({ credencial: empleado.credencial })
      .expect(201);

    const primerIntento = await request(server)
      .post('/asistencia/salida')
      .send({ credencial: empleado.credencial, idempotencyKey })
      .expect(201);

    const reintento = await request(server)
      .post('/asistencia/salida')
      .send({ credencial: empleado.credencial, idempotencyKey })
      .expect(201);

    expect(reintento.body.id).toBe(primerIntento.body.id);
  });

  // --- Alterno A: sin reemplazo disponible ---

  it('CU-LOG-003A: informa que no hay reemplazo disponible si nadie más tiene el rol', async () => {
    const solicitante = await crearEmpleado(`rol-unico-${randomUUID()}`);
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const res = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Sin reemplazo' })
      .expect(201);

    expect(res.body.solicitud.estado).toBe('SIN_REEMPLAZO');
    expect(res.body.mensaje).toMatch(/no hay personal de reemplazo/i);
  });

  // --- Alterno B: supervisor rechaza ---

  it('CU-LOG-003B: si el supervisor rechaza, el turno mantiene su asignación original', async () => {
    const solicitante = await crearEmpleado('staff');
    await crearEmpleado('staff');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Prueba de rechazo' })
      .expect(201);

    const revisada = await request(server)
      .patch(`/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .send({ aprobar: false })
      .expect(200);

    expect(revisada.body.estado).toBe('RECHAZADA');

    const turnos = await request(server).get('/turnos').expect(200);
    const turnoActualizado = turnos.body.find((t: any) => t.id === turno.id);
    expect(turnoActualizado.estado).toBe('ASIGNADO');
    expect(turnoActualizado.empleadoId).toBe(solicitante.id);
  });

  // --- Excepción C: supera límite de horas ---

  it('CU-LOG-003C: bloquea el cambio si el turno supera el máximo de horas permitidas', async () => {
    const solicitante = await crearEmpleado('extendido');
    await crearEmpleado('extendido');
    const ahora = Date.now();
    const turno = await crearTurno(solicitante.id, {
      horaInicio: new Date(ahora - 60 * 60 * 1000),
      horaFin: new Date(ahora + 15 * 60 * 60 * 1000), // 16h de duración > 12h máx.
    });

    const solicitud = await request(server)
      .post(`/turnos/${turno.id}/solicitudes-cambio`)
      .send({ motivo: 'Turno extra largo' })
      .expect(201);

    const revisada = await request(server)
      .patch(`/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .send({ aprobar: true })
      .expect(200);

    expect(revisada.body.estado).toBe('BLOQUEADA_POR_HORAS');
  });

  // --- Flujo básico de éxito: pasos 5-8 (asistencia) ---

  it('registra entrada y salida válidas y calcula las horas trabajadas (pasos 5-8)', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());

    const entrada = await request(server)
      .post('/asistencia/entrada')
      .send({ credencial: empleado.credencial })
      .expect(201);
    expect(entrada.body.tipo).toBe('ENTRADA');
    expect(entrada.body.anomalia).toBe(false);

    const salida = await request(server)
      .post('/asistencia/salida')
      .send({ credencial: empleado.credencial })
      .expect(201);
    expect(salida.body.tipo).toBe('SALIDA');
    expect(salida.body.horasCalculadas).toBeGreaterThanOrEqual(0);
  });

  // --- Excepción D: credencial inválida ---

  it('CU-LOG-003D: rechaza el registro de asistencia con credencial inválida', async () => {
    await request(server)
      .post('/asistencia/entrada')
      .send({ credencial: `credencial-inexistente-${randomUUID()}` })
      .expect(401);
  });

  // --- Excepción E: empleado sin turno vigente ---

  it('CU-LOG-003E: marca anomalía si el empleado no tiene turno vigente', async () => {
    const empleado = await crearEmpleado();
    // Turno ya finalizado, no vigente.
    const ahora = Date.now();
    await crearTurno(empleado.id, {
      horaInicio: new Date(ahora - 5 * 60 * 60 * 1000),
      horaFin: new Date(ahora - 4 * 60 * 60 * 1000),
    });

    const entrada = await request(server)
      .post('/asistencia/entrada')
      .send({ credencial: empleado.credencial })
      .expect(201);

    expect(entrada.body.anomalia).toBe(true);
    expect(entrada.body.motivoAnomalia).toMatch(/turno vigente/i);
  });

  // --- Excepción F: registro duplicado ---

  it('CU-LOG-003F: marca anomalía en una entrada duplicada sin salida previa', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());

    await request(server)
      .post('/asistencia/entrada')
      .send({ credencial: empleado.credencial })
      .expect(201);

    const segundaEntrada = await request(server)
      .post('/asistencia/entrada')
      .send({ credencial: empleado.credencial })
      .expect(201);

    expect(segundaEntrada.body.anomalia).toBe(true);
    expect(segundaEntrada.body.motivoAnomalia).toMatch(/duplicad/i);
  });

  it('marca anomalía si se registra una salida sin entrada previa', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());

    const salida = await request(server)
      .post('/asistencia/salida')
      .send({ credencial: empleado.credencial })
      .expect(201);

    expect(salida.body.anomalia).toBe(true);
    expect(salida.body.motivoAnomalia).toMatch(/sin una entrada previa/i);
  });
});
