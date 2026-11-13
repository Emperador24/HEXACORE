import type { ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { AsistenciaController } from './asistencia.controller';
import { AsistenciaService } from './asistencia.service';
import { EventosConsumidorService } from './eventos-consumidor.service';
import { EventosPublicadorService } from './eventos-publicador.service';
import { GestionPersonalService } from './gestion-personal.service';
import { TurnosService } from './turnos.service';
import { EstadoTurno } from './enums/estados';

/**
 * CU-007 a CU-009: las ramas que la e2e no arma sin un turno en el pasado,
 * una carrera o el broker caído. Cada servicio se arma con repositorios dobles.
 */
const hora = (h: number) => new Date(Date.now() + h * 3_600_000);
/** Repositorio doble: lo que no se configura devuelve vacío. */
const repo = (extra: Record<string, unknown> = {}) => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findOneBy: jest.fn().mockResolvedValue(null),
  createQueryBuilder: () => {
    const q = { where: () => q, andWhere: () => q, getMany: jest.fn().mockResolvedValue(extra.delDia ?? []) };
    return q;
  },
  ...extra,
});
const conTransaccion = (m: unknown) => ({ ...repo(), manager: { transaction: jest.fn((f: (m: unknown) => unknown) => f(m)) } });

describe('Personal y logística · defensas', () => {
  describe('AsistenciaService y su controlador (CU-009)', () => {
    const empleado = { id: 'e1', activo: true };
    const armar = (turnos = repo(), registros = repo()) =>
      new AsistenciaService(repo({ findOneBy: jest.fn().mockResolvedValue(empleado), findOne: jest.fn().mockResolvedValue(empleado) }) as never, turnos as never, registros as never);

    it('una salida en un evento donde no tiene turno vigente queda como anomalía', async () => {
      const servicio = armar();
      jest.spyOn(servicio as never, 'buscarPorIdempotencyKey').mockResolvedValue(null as never);
      jest.spyOn(servicio as never, 'buscarEmpleadoPorCredencial').mockResolvedValue(empleado as never);
      const guardar = jest.spyOn(servicio as never, 'guardarRegistro').mockResolvedValue({ anomalia: true } as never);
      await servicio.registrarSalida({ credencial: 'c', eventoId: 'ev' } as never);
      expect(guardar.mock.calls[0][1]).toMatchObject({ turnoId: null, anomalia: true, motivoAnomalia: expect.stringContaining('turno vigente') });
    });

    it('rechaza una salida anterior a su entrada', async () => {
      const servicio = armar();
      jest.spyOn(servicio as never, 'buscarPorIdempotencyKey').mockResolvedValue(null as never);
      jest.spyOn(servicio as never, 'buscarEmpleadoPorCredencial').mockResolvedValue(empleado as never);
      jest.spyOn(servicio as never, 'buscarEntradaAbierta').mockResolvedValue({ timestamp: hora(0) } as never);
      await expect(servicio.registrarSalida({ credencial: 'c', clientTimestamp: hora(-1).toISOString() } as never))
        .rejects.toThrow('anterior a la de entrada');
    });

    it('el reporte exige fechas ISO, y el estado propio exige ficha de empleado', async () => {
      await expect(armar().reporte({ desde: 'ayer' })).rejects.toThrow('ISO 8601');
      const controlador = new AsistenciaController({} as AsistenciaService);
      await expect(controlador.miEstado({ empleado: null } as never)).rejects.toMatchObject({ response: { codigo: 'SIN_FICHA_DE_EMPLEADO' } });
    });
  });

  describe('GestionPersonalService (CU-007)', () => {
    const publicador = { publicarCambioTurno: jest.fn() } as unknown as EventosPublicadorService;
    const armar = (turnos: unknown = repo(), zonas = repo(), empleados = repo()) =>
      new GestionPersonalService(empleados as never, turnos as never, zonas as never, repo() as never, publicador);

    it('candidatos: exige horario ISO y marca a quien superaría las horas del día', async () => {
      const zonas = repo({ findOneBy: jest.fn().mockResolvedValue({ id: 'z', rolRequerido: 'Seguridad' }) });
      const empleados = repo({ find: jest.fn().mockResolvedValue([{ id: 'e1', nombre: 'Ana' }]) });
      await expect(armar(repo(), zonas, empleados).candidatos('z', 'mañana', 'tarde')).rejects.toThrow('ISO 8601');
      // Ya trabaja 10 h ese día: un turno de 6 h la pasa de 14.
      const delDia = [{ horaInicio: hora(-12), horaFin: hora(-2) }];
      const [candidato] = await armar(repo({ delDia }), zonas, empleados).candidatos('z', hora(1).toISOString(), hora(7).toISOString());
      expect(candidato).toMatchObject({ disponible: false, motivo: expect.stringContaining('Superaría 14 h') });
    });

    it('no se responde una asignación cuyo turno ya terminó', async () => {
      const turno = { id: 't', empleadoId: 'e1', estado: EstadoTurno.ASIGNADO, confirmacion: 'PENDIENTE', horaFin: hora(-1) };
      const m = { findOne: jest.fn().mockResolvedValue(turno) };
      await expect(armar(conTransaccion(m)).responder('t', { aceptar: true } as never, { empleadoId: 'e1', usuarioId: 'u' }))
        .rejects.toMatchObject({ response: { codigo: 'TURNO_TERMINADO' } });
    });

    it('un dato duplicado en la base se traduce a EMPLEADO_DUPLICADO; otro fallo se propaga', async () => {
      const servicio = armar();
      const conUnicidad = (servicio as unknown as { conUnicidad(f: () => Promise<unknown>): Promise<unknown> }).conUnicidad.bind(servicio);
      const duplicada = Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), { driverError: { code: '23505' } });
      await expect(conUnicidad(() => Promise.reject(duplicada))).rejects.toMatchObject({ response: { codigo: 'EMPLEADO_DUPLICADO' } });
      await expect(conUnicidad(() => Promise.reject(new Error('base caída')))).rejects.toThrow('base caída');
    });
  });

  describe('TurnosService (CU-008)', () => {
    const publicador = { publicarCambioTurno: jest.fn() } as unknown as EventosPublicadorService;
    const armar = (turnos: unknown = repo(), empleados = repo()) =>
      new TurnosService(empleados as never, turnos as never, repo() as never, repo() as never, publicador);

    it('no da turnos a un empleado desactivado', async () => {
      const empleados = repo({ findOneBy: jest.fn().mockResolvedValue({ id: 'e1', nombre: 'Ana', activo: false }) });
      await expect(armar(repo(), empleados).crearTurno({ empleadoId: 'e1' } as never, 'u')).rejects.toThrow('desactivado');
    });

    it('no pide cambio de un turno que ya terminó', async () => {
      const m = { findOne: jest.fn().mockResolvedValue({ id: 't', empleadoId: 'e1', estado: EstadoTurno.ASIGNADO, horaFin: hora(-1) }) };
      await expect(armar(conTransaccion(m)).solicitarCambio('t', { motivo: 'x' } as never, { empleadoId: 'e1', supervisa: false, usuarioId: 'u' }))
        .rejects.toThrow('ya terminó');
    });

    it('revisar: si el turno desapareció entretanto, o al aprobar no hay reemplazo, no se cambia nada', async () => {
      const solicitud = { id: 's', estado: 'PENDIENTE', turnoId: 't', empleadoReemplazoId: null };
      const sinTurno = { findOne: jest.fn().mockResolvedValueOnce(solicitud).mockResolvedValueOnce(null) };
      await expect(armar(conTransaccion(sinTurno)).revisarSolicitud('s', { aprobar: true, supervisorId: 'j' } as never))
        .rejects.toThrow('Turno asociado no encontrado');
      const conTurno = { findOne: jest.fn().mockResolvedValueOnce({ ...solicitud }).mockResolvedValueOnce({ id: 't', empleadoId: 'e1' }) };
      await expect(armar(conTransaccion(conTurno)).revisarSolicitud('s', { aprobar: true, supervisorId: 'j' } as never))
        .rejects.toMatchObject({ response: { codigo: 'FALTA_REEMPLAZO' } });
    });

    it('el reemplazo no responde un cambio que ya no espera respuesta, ni uno cuyo turno terminó', async () => {
      const quien = { empleadoId: 'r1', usuarioId: 'u' };
      const yaRespondida = { findOne: jest.fn().mockResolvedValue({ empleadoReemplazoId: 'r1', estado: 'APROBADA', respuestaReemplazo: 'ACEPTADA' }) };
      await expect(armar(conTransaccion(yaRespondida)).responderReemplazo('s', { aceptar: true }, quien))
        .rejects.toMatchObject({ response: { codigo: 'SIN_RESPUESTA_PENDIENTE' } });
      const terminado = { findOne: jest.fn()
        .mockResolvedValueOnce({ empleadoReemplazoId: 'r1', estado: 'APROBADA', respuestaReemplazo: 'PENDIENTE', turnoId: 't' })
        .mockResolvedValueOnce({ id: 't', horaFin: hora(-1) }) };
      await expect(armar(conTransaccion(terminado)).responderReemplazo('s', { aceptar: true }, quien))
        .rejects.toMatchObject({ response: { codigo: 'TURNO_TERMINADO' } });
    });

    it('propone reemplazos marcando a quien superaría las horas del día', async () => {
      const turno = { id: 't', empleadoId: 'e1', horaInicio: hora(1), horaFin: hora(7) };
      const m = {
        find: jest.fn().mockResolvedValue([{ id: 'e2', nombre: 'Beto' }]),
        findOne: jest.fn().mockResolvedValue(null),
        getRepository: () => repo({ delDia: [{ horaInicio: hora(-12), horaFin: hora(-2) }] }),
      };
      const reemplazos = (armar() as unknown as { reemplazosPara(...a: unknown[]): Promise<{ motivo: string | null }[]> }).reemplazosPara;
      const [propuesto] = await reemplazos.call(armar(), m, turno, 'Seguridad', []);
      expect(propuesto.motivo).toContain('Superaría 14 h');
    });
  });

  describe('Mensajería de logística (CU-018)', () => {
    it('sin canal, el aviso de un cambio de turno se omite sin romper la operación', async () => {
      const publicador = new EventosPublicadorService({ obtenerCanal: () => null } as unknown as ConexionRabbitMq);
      await expect(publicador.publicarCambioTurno({ tipo: 'TURNO_CAMBIADO' } as never)).resolves.toBeUndefined();
    });

    it('el consumidor descarta repetidos, reintenta un fallo y lo manda a la DLQ al agotar los intentos', async () => {
      const canal = { prefetch: jest.fn(), consume: jest.fn(), ack: jest.fn(), nack: jest.fn(), cancel: jest.fn() };
      let entregar: (m: ConsumeMessage | null) => void = () => undefined;
      canal.consume.mockImplementation(async (_cola: string, f: (m: ConsumeMessage | null) => void) => { entregar = f; return { consumerTag: 't' }; });
      const conexion = { obtenerCanal: () => canal, registrarAlReconectar: jest.fn() };
      const notificaciones = { create: (x: unknown) => x, save: jest.fn().mockResolvedValue({}) };
      const consumidor = new EventosConsumidorService(conexion as unknown as ConexionRabbitMq, notificaciones as never);
      consumidor.onModuleInit();
      await conexion.registrarAlReconectar.mock.calls[0][0]();
      const procesar = (consumidor as unknown as { procesar(m: ConsumeMessage | null): Promise<void> }).procesar.bind(consumidor);
      const mensaje = (id: string) => ({ content: Buffer.from(JSON.stringify({ id, tipo: 'TURNO_CAMBIADO', turnoId: 't', empleadoNuevoId: 'e', mensaje: 'x', publicadoEn: new Date().toISOString() })) }) as ConsumeMessage;

      await procesar(null);
      const id = randomUUID();
      await procesar(mensaje(id));
      await procesar(mensaje(id));
      expect(canal.ack).toHaveBeenCalledTimes(2);

      notificaciones.save.mockRejectedValue(new Error('base caída'));
      const otro = mensaje(randomUUID());
      for (let i = 0; i < 5; i++) await procesar(otro);
      expect(canal.nack.mock.calls.map((c) => c[2])).toContain(true);
      expect(canal.nack.mock.calls.map((c) => c[2])).toContain(false);

      // Un mensaje ilegible que llega por la cola: el error se registra, no tumba el proceso.
      entregar({ content: Buffer.from('{roto') } as ConsumeMessage);
      await new Promise((r) => setTimeout(r, 10));
      await consumidor.onModuleDestroy();
      expect(canal.cancel).toHaveBeenCalledWith('t');
    });
  });
});
