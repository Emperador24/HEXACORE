import { ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { Empleado } from './entities/empleado.entity';
import { Turno } from './entities/turno.entity';
import { ZonaEvento } from './entities/zona-evento.entity';
import { EventosPublicadorService } from './eventos-publicador.service';
import { PersonalOperativoService } from './personal-operativo.service';

/** CU-007, pasos 8-11: validar y guardar la asignación sin carreras. */
describe('PersonalOperativoService.asignarPersonal', () => {
  const ZONA = { id: 'zona-1', eventoId: 'evt-1', nombre: 'Puerta 1', rolRequerido: 'SEGURIDAD', personalRequerido: 2 } as ZonaEvento;
  const ANA = { id: 'emp-1', nombre: 'Ana', rol: 'SEGURIDAD', activo: true } as Empleado;
  const horario = { empleadoId: ANA.id, horaInicio: '2027-01-10T18:00:00.000Z', horaFin: '2027-01-10T23:00:00.000Z' };

  function construir(opciones: { choque?: boolean; turnoExistente?: Partial<Turno> } = {}) {
    const llamadas: string[] = [];
    const consulta = { where: jest.fn(), andWhere: jest.fn(), getMany: jest.fn().mockResolvedValue([]) };
    consulta.where.mockReturnValue(consulta);
    consulta.andWhere.mockReturnValue(consulta);
    const turnosTx = {
      findOne: jest.fn((o: { lock?: unknown; where: { id?: string } }) => {
        if (o.lock) {
          llamadas.push('bloquear turno');
          return Promise.resolve(opciones.turnoExistente ? { ...opciones.turnoExistente } : null);
        }
        llamadas.push('buscar choque');
        return Promise.resolve(opciones.choque ? { id: 'otro', zona: 'Puerta 2' } : null);
      }),
      create: jest.fn((d: object) => ({ ...d })),
      createQueryBuilder: jest.fn(() => consulta),
    };
    const m = {
      getRepository: jest.fn(() => turnosTx),
      findOne: jest.fn((entidad: unknown) => {
        if (entidad === Empleado) llamadas.push('bloquear empleado');
        return Promise.resolve(ANA);
      }),
      save: jest.fn((d: object) => {
        llamadas.push('guardar');
        return Promise.resolve({ id: 'turno-nuevo', ...d });
      }),
      create: jest.fn((_e: unknown, d: object) => ({ ...d })),
    };
    const turnos = {
      manager: { transaction: jest.fn((cb: (tx: typeof m) => unknown) => cb(m)) },
      count: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const empleados = { findOneBy: jest.fn().mockResolvedValue(ANA), find: jest.fn().mockResolvedValue([]) };
    const zonas = { findOneBy: jest.fn().mockResolvedValue(ZONA) };
    const publicador = { publicarCambioTurno: jest.fn().mockResolvedValue(true) };
    const servicio = new PersonalOperativoService(
      empleados as unknown as Repository<Empleado>,
      turnos as unknown as Repository<Turno>,
      zonas as unknown as Repository<ZonaEvento>,
      publicador as unknown as EventosPublicadorService,
    );
    return { servicio, llamadas, m, publicador };
  }

  it('bloquea al empleado antes de comprobar el choque y guarda en la misma transacción', async () => {
    const { servicio, llamadas, publicador } = construir();

    const { turno } = await servicio.asignarPersonal(ZONA.id, horario, 'organizador-1');

    expect(turno.id).toBe('turno-nuevo');
    expect(llamadas.slice(0, 3)).toEqual(['bloquear empleado', 'buscar choque', 'guardar']);
    expect(publicador.publicarCambioTurno).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'PERSONAL_ASIGNADO' }));
  });

  it('con un choque de horario, rechaza sin guardar ni notificar', async () => {
    const { servicio, m, publicador } = construir({ choque: true });

    await expect(servicio.asignarPersonal(ZONA.id, horario, 'organizador-1')).rejects.toThrow(ConflictException);
    expect(m.save).not.toHaveBeenCalled();
    expect(publicador.publicarCambioTurno).not.toHaveBeenCalled();
  });

  it('CU-007C: al reasignar, bloquea el turno antes que al empleado (mismo orden que CU-008)', async () => {
    const { servicio, llamadas } = construir({
      turnoExistente: { id: 'turno-1', empleadoId: 'emp-0', zonaEventoId: ZONA.id, horaInicio: new Date(), horaFin: new Date() },
    });

    await servicio.asignarPersonal(ZONA.id, horario, 'organizador-1', 'turno-1');

    expect(llamadas.slice(0, 2)).toEqual(['bloquear turno', 'bloquear empleado']);
  });
});
