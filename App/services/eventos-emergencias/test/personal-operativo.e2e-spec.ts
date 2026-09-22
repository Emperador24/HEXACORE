import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { App } from 'supertest/types';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Empleado } from './../src/logistica/turnos-asistencia/entities/empleado.entity.js';

const RUTA = '/api/v1/logistica';

function tokenDePrueba(roles: string[] = ['Administrador', 'Personal', 'Organizador']) {
  const rutaClave = fileURLToPath(
    new URL('../../../infra/claves-desarrollo/jwt-privada.pem', import.meta.url),
  );
  const clavePrivada = readFileSync(rutaClave, 'utf8');
  return jwt.sign({ roles }, clavePrivada, {
    algorithm: 'RS256',
    issuer: 'hexacore-administracion',
    subject: randomUUID(),
    jwtid: randomUUID(),
    expiresIn: '1h',
  });
}

describe('CU-017 · Asignar personal operativo (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let auth: string;
  // Para montar escenarios que la API no permite crear —como un empleado con
  // cientos de horas a la espalda— sin tener que simular meses de trabajo.
  let empleados: Repository<Empleado>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    auth = `Bearer ${tokenDePrueba()}`;
    empleados = moduleFixture.get<Repository<Empleado>>(getRepositoryToken(Empleado));
  });

  afterAll(async () => {
    await app.close();
  });

  async function crearEmpleado(rol: string) {
    const credencial = `cred-cu017-${randomUUID()}`;
    const res = await request(server)
      .post(`${RUTA}/empleados`)
      .set('Authorization', auth)
      .send({ usuarioId: randomUUID(), nombre: `Empleado ${credencial}`, rol, credencial })
      .expect(201);
    return res.body as { id: string; nombre: string; rol: string };
  }

  async function crearZona(opts: {
    eventoId?: string;
    nombre?: string;
    rolRequerido: string;
    personalRequerido: number;
  }) {
    const res = await request(server)
      .post(`${RUTA}/zonas`)
      .set('Authorization', auth)
      .send({
        eventoId: opts.eventoId ?? `evento-${randomUUID()}`,
        nombre: opts.nombre ?? 'zona-norte',
        rolRequerido: opts.rolRequerido,
        personalRequerido: opts.personalRequerido,
      })
      .expect(201);
    return res.body as {
      id: string;
      eventoId: string;
      nombre: string;
      rolRequerido: string;
      personalRequerido: number;
    };
  }

  function ventanaHoraria(horas = 4) {
    const ahora = Date.now();
    return {
      horaInicio: new Date(ahora + 60 * 60 * 1000).toISOString(),
      horaFin: new Date(ahora + (1 + horas) * 60 * 60 * 1000).toISOString(),
    };
  }

  // --- Flujo básico de éxito: pasos 1-9 ---

  it('lista las zonas de un evento con su cobertura y asigna personal (pasos 1-9)', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const zona = await crearZona({ rolRequerido: rol, personalRequerido: 1 });

    // Paso 2: zonas del evento con personal disponible (cobertura en 0).
    const zonasAntes = await request(server)
      .get(`${RUTA}/zonas`)
      .set('Authorization', auth)
      .query({ eventoId: zona.eventoId })
      .expect(200);
    const zonaAntes = zonasAntes.body.find((z: any) => z.id === zona.id);
    expect(zonaAntes.personalAsignado).toBe(0);
    expect(zonaAntes.deficit).toBe(true);

    // Personal disponible por rol.
    const disponibles = await request(server)
      .get(`${RUTA}/personal-disponible`)
      .set('Authorization', auth)
      .query({ eventoId: zona.eventoId, rol })
      .expect(200);
    expect(disponibles.body.some((e: any) => e.id === empleado.id)).toBe(true);

    // Pasos 3-9: asignar y verificar disponibilidad, rol y cobertura.
    const { horaInicio, horaFin } = ventanaHoraria();
    const asignacion = await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio, horaFin })
      .expect(201);
    expect(asignacion.body.turno.empleadoId).toBe(empleado.id);
    expect(asignacion.body.turno.zonaEventoId).toBe(zona.id);
    expect(asignacion.body.cobertura.personalAsignado).toBe(1);
    expect(asignacion.body.cobertura.deficit).toBe(false);

    // Paso 9: notifica al empleado — misma cola/DLQ de CU-018, se sondea.
    let notificacion: any;
    for (let intento = 0; intento < 25 && !notificacion; intento++) {
      const res = await request(server)
        .get(`${RUTA}/notificaciones`)
        .set('Authorization', auth)
        .expect(200);
      notificacion = res.body.find(
        (n: any) => n.turnoId === asignacion.body.turno.id && n.tipo === 'PERSONAL_ASIGNADO',
      );
      if (!notificacion) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    expect(notificacion).toBeTruthy();
    expect(notificacion.empleadoId).toBe(empleado.id);
    expect(notificacion.latenciaMs).toBeGreaterThanOrEqual(0);
  });

  // --- Paso 5: verificación de rol ---

  it('rechaza asignar un empleado cuyo rol no coincide con el de la zona', async () => {
    const empleado = await crearEmpleado(`rol-x-${randomUUID()}`);
    const zona = await crearZona({ rolRequerido: `rol-y-${randomUUID()}`, personalRequerido: 1 });
    const { horaInicio, horaFin } = ventanaHoraria();

    await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio, horaFin })
      .expect(400);
  });

  // --- Alterno CU-017A: sugerencia de reemplazo ---

  it('CU-017A: si el empleado tiene un choque de horario, sugiere un reemplazo disponible del mismo rol', async () => {
    const rol = `entrada-${randomUUID()}`;
    const ocupado = await crearEmpleado(rol);
    const disponible = await crearEmpleado(rol);
    const zonaA = await crearZona({ rolRequerido: rol, personalRequerido: 1 });
    const zonaB = await crearZona({ eventoId: zonaA.eventoId, rolRequerido: rol, personalRequerido: 1 });
    const { horaInicio, horaFin } = ventanaHoraria();

    // El empleado ya queda ocupado en la zona A en esa ventana horaria.
    await request(server)
      .post(`${RUTA}/zonas/${zonaA.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: ocupado.id, horaInicio, horaFin })
      .expect(201);

    // Intentar asignarlo también a la zona B, mismo horario -> choque.
    const conflicto = await request(server)
      .post(`${RUTA}/zonas/${zonaB.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: ocupado.id, horaInicio, horaFin })
      .expect(409);

    expect(conflicto.body.sugerencia?.id).toBe(disponible.id);
  });

  // --- Alternos CU-017B/D: déficit de personal en una zona ---

  it('CU-017B/D: si falta personal para una zona, queda marcada con déficit', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const zona = await crearZona({ rolRequerido: rol, personalRequerido: 3 });
    const { horaInicio, horaFin } = ventanaHoraria();

    const asignacion = await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio, horaFin })
      .expect(201);

    expect(asignacion.body.cobertura.personalAsignado).toBe(1);
    expect(asignacion.body.cobertura.deficit).toBe(true);

    const zonas = await request(server)
      .get(`${RUTA}/zonas`)
      .set('Authorization', auth)
      .query({ eventoId: zona.eventoId })
      .expect(200);
    expect(zonas.body.find((z: any) => z.id === zona.id).deficit).toBe(true);
  });

  // --- Excepción CU-017C: límite de horas ---

  it('CU-017C: rechaza la asignación si el turno supera el máximo de horas permitidas', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const zona = await crearZona({ rolRequerido: rol, personalRequerido: 1 });
    const ahora = Date.now();

    await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({
        empleadoId: empleado.id,
        horaInicio: new Date(ahora + 60 * 60 * 1000).toISOString(),
        // 16h de duración > 12h máx. por turno.
        horaFin: new Date(ahora + 17 * 60 * 60 * 1000).toISOString(),
      })
      .expect(400);
  });

  it('CU-017C: el tope diario cuenta los turnos de ESE día, no las horas de toda su vida laboral',
    async () => {
      const rol = `entrada-${randomUUID()}`;
      const empleado = await crearEmpleado(rol);
      const zona = await crearZona({ rolRequerido: rol, personalRequerido: 3 });

      // Alguien con mucha trayectoria: 200 horas trabajadas en su historial.
      // Antes esto lo dejaba inasignable para siempre, porque el tope diario se
      // comparaba contra ese acumulado.
      await empleados.update({ id: empleado.id }, { horasTrabajadasTotales: 200 });

      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      manana.setHours(8, 0, 0, 0);

      await request(server)
        .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
        .set('Authorization', auth)
        .send({
          empleadoId: empleado.id,
          horaInicio: manana.toISOString(),
          horaFin: new Date(manana.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);
    });

  it('CU-017C: sí rechaza cuando los turnos del mismo día suman más del tope diario', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const zona = await crearZona({ rolRequerido: rol, personalRequerido: 3 });

    const dia = new Date();
    dia.setDate(dia.getDate() + 2);
    dia.setHours(6, 0, 0, 0);
    const enHoras = (h: number) => new Date(dia.getTime() + h * 60 * 60 * 1000).toISOString();

    // 8 h por la mañana: cabe.
    await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio: enHoras(0), horaFin: enHoras(8) })
      .expect(201);

    // Otras 8 h el mismo día suman 16 > 14 h diarias: no cabe.
    const respuesta = await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio: enHoras(10), horaFin: enHoras(18) })
      .expect(400);
    expect(respuesta.body.message).toContain('límite de horas');

    // Y al día siguiente vuelve a caber: el tope es diario, no acumulativo.
    await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio: enHoras(24), horaFin: enHoras(32) })
      .expect(201);
  });

  // --- Excepción CU-017E: reasignación de último momento ---

  it('CU-017E: un cambio de último momento actualiza el empleado y el horario del turno ya asignado', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const reemplazo = await crearEmpleado(rol);
    const zona = await crearZona({ rolRequerido: rol, personalRequerido: 1 });
    const { horaInicio, horaFin } = ventanaHoraria();

    const asignacion = await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio, horaFin })
      .expect(201);
    const turnoId = asignacion.body.turno.id as string;

    const nuevaVentana = ventanaHoraria(6);
    const reasignado = await request(server)
      .patch(`${RUTA}/turnos/${turnoId}/reasignar`)
      .set('Authorization', auth)
      .send({ empleadoId: reemplazo.id, ...nuevaVentana })
      .expect(200);

    expect(reasignado.body.turno.id).toBe(turnoId);
    expect(reasignado.body.turno.empleadoId).toBe(reemplazo.id);
    expect(reasignado.body.turno.horaInicio).toBe(nuevaVentana.horaInicio);
  });

  it('404 al reasignar un turno inexistente', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const { horaInicio, horaFin } = ventanaHoraria();

    await request(server)
      .patch(`${RUTA}/turnos/${randomUUID()}/reasignar`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio, horaFin })
      .expect(404);
  });

  it('rechaza reasignar un turno que no viene de una asignación de personal operativo (sin zona)', async () => {
    const rol = `entrada-${randomUUID()}`;
    const empleado = await crearEmpleado(rol);
    const otro = await crearEmpleado(rol);
    const { horaInicio, horaFin } = ventanaHoraria();

    // Turno creado por el flujo simple de CU-018 (POST /turnos), sin zona.
    const turno = await request(server)
      .post(`${RUTA}/turnos`)
      .set('Authorization', auth)
      .send({
        empleadoId: empleado.id,
        eventoId: `evento-${randomUUID()}`,
        zona: 'zona-suelta',
        horaInicio,
        horaFin,
      })
      .expect(201);

    await request(server)
      .patch(`${RUTA}/turnos/${turno.body.id}/reasignar`)
      .set('Authorization', auth)
      .send({ empleadoId: otro.id, horaInicio, horaFin })
      .expect(400);
  });

  it('404 al asignar personal a una zona inexistente, o un empleado inexistente', async () => {
    const zona = await crearZona({ rolRequerido: 'rol-z', personalRequerido: 1 });
    const { horaInicio, horaFin } = ventanaHoraria();

    await request(server)
      .post(`${RUTA}/zonas/${randomUUID()}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: randomUUID(), horaInicio, horaFin })
      .expect(404);

    await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: randomUUID(), horaInicio, horaFin })
      .expect(404);
  });
  it('rechaza reasignar con una ventana horaria invertida', async () => {
    const empleado = await crearEmpleado('rol-invertido');
    const zona = await crearZona({ rolRequerido: 'rol-invertido', personalRequerido: 1 });
    const { horaInicio, horaFin } = ventanaHoraria();
    const asignacion = await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: empleado.id, horaInicio, horaFin })
      .expect(201);

    const sustituto = await crearEmpleado('rol-invertido');
    const res = await request(server)
      .patch(`${RUTA}/turnos/${asignacion.body.turno.id}/reasignar`)
      .set('Authorization', auth)
      // Fin antes que inicio: el error tiene que venir del servicio, no de
      // una fecha rara guardada en la base.
      .send({ empleadoId: sustituto.id, horaInicio: horaFin, horaFin: horaInicio })
      .expect(400);

    expect(res.body.message).toMatch(/horaFin debe ser posterior/i);
  });

  it('CU-017A: si nadie del rol está libre, no inventa un reemplazo', async () => {
    const rol = `rol-sin-reemplazo-${randomUUID().slice(0, 8)}`;
    const zona = await crearZona({ rolRequerido: rol, personalRequerido: 2 });
    const { horaInicio, horaFin } = ventanaHoraria();

    // Un solo empleado de ese rol, y se le ocupa la franja entera: cuando la
    // segunda asignación choque, la búsqueda de reemplazo recorre a los
    // candidatos y se queda sin ninguno disponible.
    const unico = await crearEmpleado(rol);
    await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: unico.id, horaInicio, horaFin })
      .expect(201);

    const choque = await request(server)
      .post(`${RUTA}/zonas/${zona.id}/asignaciones`)
      .set('Authorization', auth)
      .send({ empleadoId: unico.id, horaInicio, horaFin })
      .expect(409);

    expect(choque.body.sugerencia ?? null).toBeNull();
  });
});
