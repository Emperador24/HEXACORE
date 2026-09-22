import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { JEFE_DE_PERSONAL } from './../src/logistica/turnos-asistencia/turnos-asistencia.constants.js';

const RUTA = '/api/v1/logistica';

// Mismos valores por defecto que el proveedor de Redis del servicio
// (`comun/autenticacion/redis.provider.ts`): la prueba tiene que escribir la
// revocación en la MISMA instancia que el guardia consulta.
const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PUERTO = Number(process.env.REDIS_PUERTO ?? 6380);

function clavePrivadaDePrueba() {
  return readFileSync(
    fileURLToPath(
      new URL('../../../infra/claves-desarrollo/jwt-privada.pem', import.meta.url),
    ),
    'utf8',
  );
}

function tokenDePrueba(
  roles: string[] = ['Administrador', 'Personal', 'Organizador'],
  usuarioId = randomUUID(),
  jti = randomUUID(),
) {
  return jwt.sign({ roles }, clavePrivadaDePrueba(), {
    algorithm: 'RS256',
    issuer: 'hexacore-administracion',
    subject: usuarioId,
    jwtid: jti,
    expiresIn: '1h',
  });
}

describe('CU-018 · Gestionar turno y asistencia del personal (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let auth: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Test.createTestingModule no pasa por src/main.ts: el prefijo hay que
    // fijarlo también aquí o toda ruta responde 404.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    auth = `Bearer ${tokenDePrueba()}`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function crearEmpleado(rol = 'seguridad') {
    const credencial = `cred-${randomUUID()}`;
    const res = await request(server)
      .post(`${RUTA}/empleados`)
      .set('Authorization', auth)
      .send({ usuarioId: randomUUID(), nombre: `Empleado ${credencial}`, rol, credencial })
      .expect(201);
    return res.body as { id: string; credencial: string; usuarioId: string };
  }

  /**
   * La sesión de una persona concreta, con el rol de cuenta que de verdad
   * lleva quien trabaja aquí: `Personal` y nada más.
   *
   * Es la diferencia con `auth`, que es un token de Administrador. Casi todas
   * las pruebas usan aquel por comodidad, pero la autorización hay que
   * probarla con esto: si no, se prueba el camino del jefe y nunca el del
   * empleado raso.
   */
  function sesionDe(empleado: { usuarioId: string }) {
    return `Bearer ${tokenDePrueba(['Personal'], empleado.usuarioId)}`;
  }

  async function crearTurno(
    empleadoId: string,
    opts: { horaInicio: Date; horaFin: Date; zona?: string; eventoId?: string },
  ) {
    const res = await request(server)
      .post(`${RUTA}/turnos`)
      .set('Authorization', auth)
      .send({
        empleadoId,
        eventoId: opts.eventoId ?? `evento-${randomUUID()}`,
        zona: opts.zona ?? 'zona-norte',
        horaInicio: opts.horaInicio.toISOString(),
        horaFin: opts.horaFin.toISOString(),
      })
      .expect(201);
    return res.body as { id: string; empleadoId: string; eventoId: string };
  }

  function turnoVigente(horas = 4) {
    const ahora = Date.now();
    return {
      horaInicio: new Date(ahora - 60 * 60 * 1000),
      horaFin: new Date(ahora + horas * 60 * 60 * 1000),
    };
  }

  // --- RNF-06: nadie sin sesión válida llega a un endpoint de negocio ---

  it('RNF-06: 401 sin token de sesión', async () => {
    await request(server).get(`${RUTA}/turnos`).expect(401);
  });

  it('RNF-06: 401 con un token mal firmado', async () => {
    await request(server)
      .get(`${RUTA}/turnos`)
      .set('Authorization', 'Bearer esto-no-es-un-jwt-valido')
      .expect(401);
  });

  // --- Flujo básico de éxito: pasos 1-4 ---

  it('solicita un cambio de turno y encuentra reemplazo disponible (pasos 1-2)', async () => {
    const solicitante = await crearEmpleado('seguridad');
    await crearEmpleado('seguridad');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const res = await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
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
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Emergencia familiar' })
      .expect(201);

    const revisada = await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: true })
      .expect(200);

    expect(revisada.body.estado).toBe('APROBADA');
    // El supervisor lo pone el token, no el cuerpo de la petición (si no,
    // cualquiera podría aprobar su propio cambio declarándose supervisor).
    expect(revisada.body.revisadoPorId).toBeTruthy();
    // Regresión: la respuesta del PATCH debe traer el turno YA actualizado
    // (empleado reasignado, estado CAMBIADO), no el estado previo a la
    // reasignación — ver corrección de `solicitud.turno` en turnos.service.
    expect(revisada.body.turno.estado).toBe('CAMBIADO');
    expect(revisada.body.turno.empleadoId).not.toBe(solicitante.id);
    expect(revisada.body.turno.empleado.id).toBe(revisada.body.turno.empleadoId);

    const turnos = await request(server)
      .get(`${RUTA}/turnos`)
      .set('Authorization', auth)
      .expect(200);
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
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Prueba de listado' })
      .expect(201);
    const solicitudId = solicitud.body.solicitud.id as string;

    const todas = await request(server)
      .get(`${RUTA}/solicitudes-cambio`)
      .set('Authorization', auth)
      .expect(200);
    expect(todas.body.some((s: any) => s.id === solicitudId)).toBe(true);

    const pendientes = await request(server)
      .get(`${RUTA}/solicitudes-cambio`)
      .set('Authorization', auth)
      .query({ estado: 'PENDIENTE' })
      .expect(200);
    expect(pendientes.body.some((s: any) => s.id === solicitudId)).toBe(true);
    expect(pendientes.body.every((s: any) => s.estado === 'PENDIENTE')).toBe(true);

    await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitudId}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: true })
      .expect(200);

    const pendientesLuego = await request(server)
      .get(`${RUTA}/solicitudes-cambio`)
      .set('Authorization', auth)
      .query({ estado: 'PENDIENTE' })
      .expect(200);
    expect(pendientesLuego.body.some((s: any) => s.id === solicitudId)).toBe(false);

    const aprobadas = await request(server)
      .get(`${RUTA}/solicitudes-cambio`)
      .set('Authorization', auth)
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
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Prueba de mensajería' })
      .expect(201);

    await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: true })
      .expect(200);

    // El consumidor procesa de forma asíncrona; se sondea hasta 5s.
    let notificacion: any;
    for (let intento = 0; intento < 25 && !notificacion; intento++) {
      const res = await request(server)
        .get(`${RUTA}/notificaciones`)
        .set('Authorization', auth)
        .expect(200);
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
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({
        credencial: empleado.credencial,
        clientTimestamp: horaEventoOffline,
        idempotencyKey,
      })
      .expect(201);

    // El dispositivo reintenta el envío (misma clave) al recuperar señal.
    const reintento = await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({
        credencial: empleado.credencial,
        clientTimestamp: horaEventoOffline,
        idempotencyKey,
      })
      .expect(201);

    expect(reintento.body.id).toBe(primerIntento.body.id);
    expect(new Date(primerIntento.body.timestamp).toISOString()).toBe(horaEventoOffline);

    const registros = await request(server)
      .get(`${RUTA}/asistencia`)
      .set('Authorization', auth)
      .expect(200);
    const coincidencias = registros.body.filter(
      (r: any) => r.idempotencyKey === idempotencyKey,
    );
    expect(coincidencias).toHaveLength(1);
  });

  it('404 al crear un turno para un empleado inexistente', async () => {
    const { horaInicio, horaFin } = turnoVigente();
    await request(server)
      .post(`${RUTA}/turnos`)
      .set('Authorization', auth)
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
      .post(`${RUTA}/turnos/${randomUUID()}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Turno inexistente' })
      .expect(404);
  });

  it('rechaza crear un turno con horaFin anterior o igual a horaInicio', async () => {
    const empleado = await crearEmpleado('horario-invalido');
    const ahora = Date.now();
    await request(server)
      .post(`${RUTA}/turnos`)
      .set('Authorization', auth)
      .send({
        empleadoId: empleado.id,
        eventoId: 'evento-x',
        zona: 'zona-x',
        horaInicio: new Date(ahora).toISOString(),
        horaFin: new Date(ahora - 60 * 60 * 1000).toISOString(),
      })
      .expect(400);
  });

  it('409 al crear un empleado con una credencial ya usada', async () => {
    const credencial = `duplicada-${randomUUID()}`;
    await request(server)
      .post(`${RUTA}/empleados`)
      .set('Authorization', auth)
      .send({ usuarioId: randomUUID(), nombre: 'Primero', rol: 'x', credencial })
      .expect(201);

    await request(server)
      .post(`${RUTA}/empleados`)
      .set('Authorization', auth)
      .send({ usuarioId: randomUUID(), nombre: 'Segundo', rol: 'x', credencial })
      .expect(409);
  });

  it('lista los empleados registrados', async () => {
    await crearEmpleado('inventario');
    const res = await request(server)
      .get(`${RUTA}/empleados`)
      .set('Authorization', auth)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('rechaza solicitar un cambio si el turno ya tiene un cambio en curso', async () => {
    const solicitante = await crearEmpleado('doble-solicitud');
    await crearEmpleado('doble-solicitud');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Primera solicitud' })
      .expect(201);

    await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Segunda solicitud, turno ya en trámite' })
      .expect(400);
  });

  it('404 al revisar una solicitud de cambio inexistente', async () => {
    await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${randomUUID()}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: true })
      .expect(404);
  });

  it('rechaza revisar dos veces la misma solicitud ya resuelta', async () => {
    const solicitante = await crearEmpleado('doble-revision');
    await crearEmpleado('doble-revision');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Revisión única' })
      .expect(201);

    await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: false })
      .expect(200);

    await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: true })
      .expect(400);
  });

  it('un registro de salida offline con idempotencyKey no se duplica al reintentar', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());
    const idempotencyKey = `offline-salida-${randomUUID()}`;

    await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);

    const primerIntento = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, idempotencyKey })
      .expect(201);

    const reintento = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, idempotencyKey })
      .expect(201);

    expect(reintento.body.id).toBe(primerIntento.body.id);
  });

  // --- Alterno A: sin reemplazo disponible ---

  it('CU-018A: informa que no hay reemplazo disponible si nadie más tiene el rol', async () => {
    const solicitante = await crearEmpleado(`rol-unico-${randomUUID()}`);
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const res = await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Sin reemplazo' })
      .expect(201);

    expect(res.body.solicitud.estado).toBe('SIN_REEMPLAZO');
    expect(res.body.mensaje).toMatch(/no hay personal de reemplazo/i);
  });

  // --- Alterno B: supervisor rechaza ---

  it('CU-018B: si el supervisor rechaza, el turno mantiene su asignación original', async () => {
    const solicitante = await crearEmpleado('staff');
    await crearEmpleado('staff');
    const turno = await crearTurno(solicitante.id, turnoVigente());

    const solicitud = await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Prueba de rechazo' })
      .expect(201);

    const revisada = await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: false })
      .expect(200);

    expect(revisada.body.estado).toBe('RECHAZADA');

    const turnos = await request(server)
      .get(`${RUTA}/turnos`)
      .set('Authorization', auth)
      .expect(200);
    const turnoActualizado = turnos.body.find((t: any) => t.id === turno.id);
    expect(turnoActualizado.estado).toBe('ASIGNADO');
    expect(turnoActualizado.empleadoId).toBe(solicitante.id);
  });

  // --- Excepción C: supera límite de horas ---

  it('CU-018C: bloquea el cambio si el turno supera el máximo de horas permitidas', async () => {
    const solicitante = await crearEmpleado('extendido');
    await crearEmpleado('extendido');
    const ahora = Date.now();
    const turno = await crearTurno(solicitante.id, {
      horaInicio: new Date(ahora - 60 * 60 * 1000),
      horaFin: new Date(ahora + 15 * 60 * 60 * 1000), // 16h de duración > 12h máx.
    });

    const solicitud = await request(server)
      .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
      .set('Authorization', auth)
      .send({ motivo: 'Turno extra largo' })
      .expect(201);

    const revisada = await request(server)
      .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
      .set('Authorization', auth)
      .send({ aprobar: true })
      .expect(200);

    expect(revisada.body.estado).toBe('BLOQUEADA_POR_HORAS');
  });

  // --- Flujo básico de éxito: pasos 5-8 (asistencia) ---

  it('registra entrada y salida válidas y calcula las horas trabajadas (pasos 5-8)', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());

    const entrada = await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);
    expect(entrada.body.tipo).toBe('ENTRADA');
    expect(entrada.body.anomalia).toBe(false);

    const salida = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);
    expect(salida.body.tipo).toBe('SALIDA');
    expect(salida.body.horasCalculadas).toBeGreaterThanOrEqual(0);
  });

  // --- Excepción D: credencial inválida ---

  it('CU-018D: rechaza el registro de asistencia con credencial inválida', async () => {
    await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: `credencial-inexistente-${randomUUID()}` })
      .expect(401);
  });

  // --- Excepción E: empleado sin turno vigente ---

  it('CU-018E: marca anomalía si el empleado no tiene turno vigente', async () => {
    const empleado = await crearEmpleado();
    // Turno ya finalizado, no vigente.
    const ahora = Date.now();
    await crearTurno(empleado.id, {
      horaInicio: new Date(ahora - 5 * 60 * 60 * 1000),
      horaFin: new Date(ahora - 4 * 60 * 60 * 1000),
    });

    const entrada = await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);

    expect(entrada.body.anomalia).toBe(true);
    expect(entrada.body.motivoAnomalia).toMatch(/turno vigente/i);
  });

  // --- Excepción F: registro duplicado ---

  it('CU-018F: marca anomalía en una entrada duplicada sin salida previa', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());

    await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);

    const segundaEntrada = await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);

    expect(segundaEntrada.body.anomalia).toBe(true);
    expect(segundaEntrada.body.motivoAnomalia).toMatch(/duplicad/i);
  });

  it('marca anomalía si se registra una salida sin entrada previa', async () => {
    const empleado = await crearEmpleado();
    await crearTurno(empleado.id, turnoVigente());

    const salida = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial })
      .expect(201);

    expect(salida.body.anomalia).toBe(true);
    expect(salida.body.motivoAnomalia).toMatch(/sin una entrada previa/i);
  });

  // --- Asistencia no debe cruzarse entre eventos simultáneos ---

  it('la salida de un evento no cierra la entrada abierta de otro evento simultáneo', async () => {
    const empleado = await crearEmpleado();
    const { horaInicio, horaFin } = turnoVigente();
    const turnoEventoA = await crearTurno(empleado.id, {
      horaInicio,
      horaFin,
      eventoId: 'evento-A',
      zona: 'zona-A',
    });
    const turnoEventoB = await crearTurno(empleado.id, {
      horaInicio,
      horaFin,
      eventoId: 'evento-B',
      zona: 'zona-B',
    });

    // El mismo empleado entra a los dos eventos que corren en simultáneo.
    const entradaA = await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, eventoId: 'evento-A' })
      .expect(201);
    expect(entradaA.body.anomalia).toBe(false);
    expect(entradaA.body.turnoId).toBe(turnoEventoA.id);

    const entradaB = await request(server)
      .post(`${RUTA}/asistencia/entrada`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, eventoId: 'evento-B' })
      .expect(201);
    expect(entradaB.body.anomalia).toBe(false);
    expect(entradaB.body.turnoId).toBe(turnoEventoB.id);

    // Marca salida del evento A: debe cerrar la entrada de A, no la de B.
    const salidaA = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, eventoId: 'evento-A' })
      .expect(201);
    expect(salidaA.body.anomalia).toBeFalsy();
    expect(salidaA.body.turnoId).toBe(turnoEventoA.id);

    // El evento B sigue con la entrada abierta: otra salida de A debería
    // fallar por "sin entrada previa" (la de A ya se cerró), mientras que
    // B todavía puede cerrarse con su propia salida.
    const segundaSalidaA = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, eventoId: 'evento-A' })
      .expect(201);
    expect(segundaSalidaA.body.anomalia).toBe(true);

    const salidaB = await request(server)
      .post(`${RUTA}/asistencia/salida`)
      .set('Authorization', auth)
      .send({ credencial: empleado.credencial, eventoId: 'evento-B' })
      .expect(201);
    expect(salidaB.body.anomalia).toBeFalsy();
    expect(salidaB.body.turnoId).toBe(turnoEventoB.id);
  });
  // --- Autorización: cada quien a lo suyo -------------------------------
  //
  // El rol de cuenta del token no distingue al Jefe de personal de un
  // empleado de entrada: los dos llevan `Personal` (CU-027 solo define cuatro
  // roles). Quien manda se decide por el campo `rol` de la ficha local, y eso
  // es lo que comprueban estas pruebas.

  describe('quien no supervisa solo alcanza lo suyo', () => {
    it('no puede dar de alta a otro empleado', async () => {
      const empleado = await crearEmpleado('entrada');
      await request(server)
        .post(`${RUTA}/empleados`)
        .set('Authorization', sesionDe(empleado))
        .send({
          usuarioId: randomUUID(),
          nombre: 'Colado',
          rol: 'entrada',
          credencial: `cred-${randomUUID()}`,
        })
        .expect(403);
    });

    it('no puede crear turnos', async () => {
      const empleado = await crearEmpleado('entrada');
      const { horaInicio, horaFin } = turnoVigente();
      await request(server)
        .post(`${RUTA}/turnos`)
        .set('Authorization', sesionDe(empleado))
        .send({
          empleadoId: empleado.id,
          eventoId: 'evento-x',
          zona: 'zona-norte',
          horaInicio: horaInicio.toISOString(),
          horaFin: horaFin.toISOString(),
        })
        .expect(403);
    });

    it('no puede listar a todo el personal (expone la credencial de cada uno)', async () => {
      const empleado = await crearEmpleado('entrada');
      await request(server)
        .get(`${RUTA}/empleados`)
        .set('Authorization', sesionDe(empleado))
        .expect(403);
    });

    it('solo ve sus propios turnos, no los de sus compañeros', async () => {
      const mio = await crearEmpleado('entrada');
      const ajeno = await crearEmpleado('entrada');
      const turnoMio = await crearTurno(mio.id, turnoVigente());
      const turnoAjeno = await crearTurno(ajeno.id, turnoVigente());

      const res = await request(server)
        .get(`${RUTA}/turnos`)
        .set('Authorization', sesionDe(mio))
        .expect(200);

      const ids = (res.body as { id: string }[]).map((turno) => turno.id);
      expect(ids).toContain(turnoMio.id);
      expect(ids).not.toContain(turnoAjeno.id);
    });

    it('no puede pedir el cambio del turno de otro', async () => {
      const mio = await crearEmpleado('entrada');
      const ajeno = await crearEmpleado('entrada');
      const turnoAjeno = await crearTurno(ajeno.id, turnoVigente());

      await request(server)
        .post(`${RUTA}/turnos/${turnoAjeno.id}/solicitudes-cambio`)
        .set('Authorization', sesionDe(mio))
        .send({ motivo: 'Me apetece' })
        .expect(403);
    });

    it('no puede aprobar una solicitud de cambio — ni la suya', async () => {
      const solicitante = await crearEmpleado('vigilancia');
      await crearEmpleado('vigilancia');
      const turno = await crearTurno(solicitante.id, turnoVigente());

      const solicitud = await request(server)
        .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
        .set('Authorization', sesionDe(solicitante))
        .send({ motivo: 'Cita médica' })
        .expect(201);

      await request(server)
        .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
        .set('Authorization', sesionDe(solicitante))
        .send({ aprobar: true })
        .expect(403);
    });

    it('no puede asignar personal a una zona (CU-017)', async () => {
      const empleado = await crearEmpleado('entrada');
      await request(server)
        .post(`${RUTA}/zonas`)
        .set('Authorization', sesionDe(empleado))
        .send({
          eventoId: 'evento-x',
          nombre: 'Puerta Sur',
          rolRequerido: 'entrada',
          personalRequerido: 2,
        })
        .expect(403);
    });

    it('solo ve sus propios fichajes de asistencia', async () => {
      const mio = await crearEmpleado('entrada');
      const ajeno = await crearEmpleado('entrada');
      await crearTurno(mio.id, turnoVigente());
      await crearTurno(ajeno.id, turnoVigente());

      for (const quien of [mio, ajeno]) {
        await request(server)
          .post(`${RUTA}/asistencia/entrada`)
          .set('Authorization', auth)
          .send({ credencial: quien.credencial, eventoId: 'evento-x' })
          .expect(201);
      }

      const res = await request(server)
        .get(`${RUTA}/asistencia`)
        .set('Authorization', sesionDe(mio))
        .expect(200);

      const empleados = (res.body as { empleadoId: string }[]).map((r) => r.empleadoId);
      expect(empleados).toContain(mio.id);
      expect(empleados).not.toContain(ajeno.id);
    });
  });

  describe('el Jefe de personal sí, y sin rol de cuenta especial', () => {
    it('da de alta, crea turnos y aprueba cambios llevando solo el rol "Personal"', async () => {
      // La clave de toda la autorización de logística: este token es
      // indistinguible del de un empleado raso. Lo que le da el mando es su
      // ficha, cuyo `rol` es "Jefe de personal".
      const jefe = await crearEmpleado(JEFE_DE_PERSONAL);
      const comoJefe = sesionDe(jefe);

      const alta = await request(server)
        .post(`${RUTA}/empleados`)
        .set('Authorization', comoJefe)
        .send({
          usuarioId: randomUUID(),
          nombre: 'Contratado por el jefe',
          rol: 'catering',
          credencial: `cred-${randomUUID()}`,
        })
        .expect(201);

      await crearEmpleado('catering');
      const { horaInicio, horaFin } = turnoVigente();
      const turno = await request(server)
        .post(`${RUTA}/turnos`)
        .set('Authorization', comoJefe)
        .send({
          empleadoId: alta.body.id,
          eventoId: `evento-${randomUUID()}`,
          zona: 'cocina',
          horaInicio: horaInicio.toISOString(),
          horaFin: horaFin.toISOString(),
        })
        .expect(201);

      const solicitud = await request(server)
        .post(`${RUTA}/turnos/${turno.body.id}/solicitudes-cambio`)
        .set('Authorization', comoJefe)
        .send({ motivo: 'Reorganización' })
        .expect(201);

      await request(server)
        .patch(`${RUTA}/solicitudes-cambio/${solicitud.body.solicitud.id}/revisar`)
        .set('Authorization', comoJefe)
        .send({ aprobar: false })
        .expect(200);
    });

    it('ve los turnos de todo el personal', async () => {
      const jefe = await crearEmpleado(JEFE_DE_PERSONAL);
      const otro = await crearEmpleado('entrada');
      const turnoAjeno = await crearTurno(otro.id, turnoVigente());

      const res = await request(server)
        .get(`${RUTA}/turnos`)
        .set('Authorization', sesionDe(jefe))
        .expect(200);

      expect((res.body as { id: string }[]).map((t) => t.id)).toContain(turnoAjeno.id);
    });
  });

  it('una cuenta sin ficha de empleado no ve turno alguno', async () => {
    const forastero = `Bearer ${tokenDePrueba(['Cliente'], randomUUID())}`;
    const empleado = await crearEmpleado('entrada');
    await crearTurno(empleado.id, turnoVigente());

    const res = await request(server)
      .get(`${RUTA}/turnos`)
      .set('Authorization', forastero)
      .expect(200);

    // Vacío, no "todos": es el caso que rompe un parámetro opcional mal puesto.
    expect(res.body).toEqual([]);
  });
  // --- `GET /empleados/yo`: la ficha del que entra -----------------------
  //
  // Es lo PRIMERO que consulta la app móvil al iniciar sesión, y lo que decide
  // a qué pantallas entra cada quien. No tenía ninguna prueba de integración.

  describe('la ficha del empleado que hace la petición', () => {
    it('devuelve su ficha y el turno que está cubriendo ahora mismo', async () => {
      const empleado = await crearEmpleado('taquilla');
      const turno = await crearTurno(empleado.id, turnoVigente());

      const res = await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', sesionDe(empleado))
        .expect(200);

      expect(res.body.empleado.id).toBe(empleado.id);
      expect(res.body.empleado.rol).toBe('taquilla');
      expect(res.body.turnoVigente?.id).toBe(turno.id);
    });

    it('sin turno en curso, la ficha viene con turnoVigente en null', async () => {
      const empleado = await crearEmpleado('taquilla');

      const res = await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', sesionDe(empleado))
        .expect(200);

      expect(res.body.empleado.id).toBe(empleado.id);
      expect(res.body.turnoVigente).toBeNull();
    });

    it('una cuenta que no trabaja aquí recibe 404 explicándolo', async () => {
      const forastero = `Bearer ${tokenDePrueba(['Cliente'], randomUUID())}`;

      const res = await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', forastero)
        .expect(404);

      expect(res.body.codigo).toBe('SIN_FICHA_DE_EMPLEADO');
    });
  });

  // --- Listado acotado de solicitudes de cambio ---------------------------

  describe('cada quien ve las solicitudes de cambio que le corresponden', () => {
    it('quien no supervisa ve las suyas y no las de un compañero', async () => {
      const mio = await crearEmpleado('barra');
      const ajeno = await crearEmpleado('barra');
      await crearEmpleado('barra'); // reemplazo disponible
      const turnoMio = await crearTurno(mio.id, turnoVigente());
      const turnoAjeno = await crearTurno(ajeno.id, turnoVigente());

      for (const [quien, turno] of [
        [mio, turnoMio],
        [ajeno, turnoAjeno],
      ] as const) {
        await request(server)
          .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
          .set('Authorization', sesionDe(quien))
          .send({ motivo: 'Motivo de prueba' })
          .expect(201);
      }

      const res = await request(server)
        .get(`${RUTA}/solicitudes-cambio`)
        .set('Authorization', sesionDe(mio))
        .expect(200);

      const turnos = (res.body as { turnoId: string }[]).map((s) => s.turnoId);
      expect(turnos).toContain(turnoMio.id);
      expect(turnos).not.toContain(turnoAjeno.id);
    });

    it('filtra las suyas por estado', async () => {
      const empleado = await crearEmpleado('guardarropa');
      await crearEmpleado('guardarropa');
      const turno = await crearTurno(empleado.id, turnoVigente());
      await request(server)
        .post(`${RUTA}/turnos/${turno.id}/solicitudes-cambio`)
        .set('Authorization', sesionDe(empleado))
        .send({ motivo: 'Cita médica' })
        .expect(201);

      const pendientes = await request(server)
        .get(`${RUTA}/solicitudes-cambio?estado=PENDIENTE`)
        .set('Authorization', sesionDe(empleado))
        .expect(200);
      expect(
        (pendientes.body as { turnoId: string }[]).map((s) => s.turnoId),
      ).toContain(turno.id);

      const aprobadas = await request(server)
        .get(`${RUTA}/solicitudes-cambio?estado=APROBADA`)
        .set('Authorization', sesionDe(empleado))
        .expect(200);
      expect(
        (aprobadas.body as { turnoId: string }[]).map((s) => s.turnoId),
      ).not.toContain(turno.id);
    });

    it('quien no es empleado no ve ninguna', async () => {
      const forastero = `Bearer ${tokenDePrueba(['Cliente'], randomUUID())}`;
      const res = await request(server)
        .get(`${RUTA}/solicitudes-cambio`)
        .set('Authorization', forastero)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('un empleado sin turnos tampoco', async () => {
      const empleado = await crearEmpleado('limpieza');
      const res = await request(server)
        .get(`${RUTA}/solicitudes-cambio`)
        .set('Authorization', sesionDe(empleado))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });
  // --- RNF-06: las dos rutas de rechazo que faltaban ---------------------

  describe('el guardia de sesión rechaza lo que debe', () => {
    it('una sesión revocada ya no sirve, aunque el token siga firmado y vigente', async () => {
      const empleado = await crearEmpleado('acomodacion');
      // Se firma un token normal y se anota su `jti` como revocado en Redis,
      // que es exactamente lo que hace Administración al cerrar sesión (ver
      // App/shared/seguridad/token-sesion.md). El token no caduca ni cambia:
      // lo que cambia es la anotación compartida.
      const jti = randomUUID();
      const token = tokenDePrueba(['Personal'], empleado.usuarioId, jti);

      await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const redis = new Redis({ host: REDIS_HOST, port: REDIS_PUERTO });
      try {
        await redis.set(`sesion-revocada:${jti}`, '1', 'EX', 120);
      } finally {
        await redis.quit();
      }

      const res = await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(res.body.mensaje).toMatch(/sesión se cerró/i);
    });

    it('un token bien firmado pero con un `sub` que no es UUID no pasa', async () => {
      // El emisor y la firma son correctos: lo que falla es la forma del
      // contenido. Sin esta comprobación, un `sub` arbitrario se usaría tal
      // cual para buscar la ficha del empleado.
      const token = jwt.sign({ roles: ['Personal'] }, clavePrivadaDePrueba(), {
        algorithm: 'RS256',
        issuer: 'hexacore-administracion',
        subject: 'no-soy-un-uuid',
        jwtid: randomUUID(),
        expiresIn: '1h',
      });

      await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('un token caducado tampoco', async () => {
      const token = jwt.sign({ roles: ['Personal'] }, clavePrivadaDePrueba(), {
        algorithm: 'RS256',
        issuer: 'hexacore-administracion',
        subject: randomUUID(),
        jwtid: randomUUID(),
        expiresIn: '-1s',
      });

      await request(server)
        .get(`${RUTA}/empleados/yo`)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });
});
