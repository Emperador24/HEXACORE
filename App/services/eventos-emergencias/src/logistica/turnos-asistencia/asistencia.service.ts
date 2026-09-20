import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto.js';
import { Empleado } from './entities/empleado.entity.js';
import { RegistroAsistencia } from './entities/registro-asistencia.entity.js';
import { Turno } from './entities/turno.entity.js';
import { TipoRegistroAsistencia } from './enums/estados.js';

@Injectable()
export class AsistenciaService {
  constructor(
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(RegistroAsistencia)
    private readonly registros: Repository<RegistroAsistencia>,
  ) {}

  /**
   * CU-018, pasos 5-6 + excepciones D/E/F: valida credencial, valida que el
   * empleado esté asignado a un turno vigente, y detecta duplicados.
   *
   * Offline-first: si el dispositivo de control registró el evento sin
   * conexión, envía `clientTimestamp` (hora real del evento) e
   * `idempotencyKey` (para poder reintentar la sincronización sin
   * duplicar el registro cuando recupere señal).
   */
  async registrarEntrada(dto: RegistrarAsistenciaDto) {
    const repetido = await this.buscarPorIdempotencyKey(dto.idempotencyKey);
    if (repetido) {
      return repetido;
    }

    const empleado = await this.buscarEmpleadoPorCredencial(dto.credencial);
    const momento = dto.clientTimestamp ? new Date(dto.clientTimestamp) : new Date();

    // CU-018E: el empleado no está asignado al evento (sin turno vigente
    // *al momento real del registro*, no al momento de la sincronización).
    // Si el punto de control indica `eventoId`, el turno vigente debe ser
    // justo el de ESE evento — así dos eventos simultáneos no se cruzan.
    const turnoVigente = await this.turnos.findOne({
      where: {
        empleadoId: empleado.id,
        ...(dto.eventoId ? { eventoId: dto.eventoId } : {}),
        horaInicio: LessThanOrEqual(momento),
        horaFin: MoreThanOrEqual(momento),
      },
    });
    if (!turnoVigente) {
      return this.guardarRegistro(dto, {
        empleadoId: empleado.id,
        turnoId: null,
        tipo: TipoRegistroAsistencia.ENTRADA,
        timestamp: momento,
        anomalia: true,
        motivoAnomalia:
          'El empleado no tiene un turno vigente asignado para este evento.',
      });
    }

    // CU-018F: entrada duplicada sin salida previa -> anomalía.
    const entradaAbierta = await this.registros.findOne({
      where: {
        empleadoId: empleado.id,
        turnoId: turnoVigente.id,
        tipo: TipoRegistroAsistencia.ENTRADA,
      },
      order: { timestamp: 'DESC' },
    });
    const yaTieneSalida = entradaAbierta
      ? await this.registros.findOne({
          where: {
            empleadoId: empleado.id,
            turnoId: turnoVigente.id,
            tipo: TipoRegistroAsistencia.SALIDA,
          },
          order: { timestamp: 'DESC' },
        })
      : null;
    const esDuplicado =
      !!entradaAbierta &&
      (!yaTieneSalida || yaTieneSalida.timestamp < entradaAbierta.timestamp);

    return this.guardarRegistro(dto, {
      empleadoId: empleado.id,
      turnoId: turnoVigente.id,
      tipo: TipoRegistroAsistencia.ENTRADA,
      timestamp: momento,
      anomalia: esDuplicado,
      motivoAnomalia: esDuplicado
        ? 'Registro de entrada duplicado sin salida previa.'
        : null,
    });
  }

  /**
   * CU-018, pasos 7-8: registra la salida y calcula las horas trabajadas
   * sobre el momento real del evento (offline-first, ver registrarEntrada).
   */
  async registrarSalida(dto: RegistrarAsistenciaDto) {
    const repetido = await this.buscarPorIdempotencyKey(dto.idempotencyKey);
    if (repetido) {
      return repetido;
    }

    const empleado = await this.buscarEmpleadoPorCredencial(dto.credencial);
    const momento = dto.clientTimestamp ? new Date(dto.clientTimestamp) : new Date();

    // Si el punto de control indica `eventoId`, la salida solo puede
    // cerrar una entrada del turno vigente de ESE evento — igual que en
    // registrarEntrada. Sin esto, un empleado con turnos simultáneos en
    // dos eventos podía marcar salida en uno y cerrar por error la
    // entrada del otro (siempre tomaba "la última entrada", sin más).
    let turnoId: string | undefined;
    if (dto.eventoId) {
      const turnoVigente = await this.turnos.findOne({
        where: {
          empleadoId: empleado.id,
          eventoId: dto.eventoId,
          horaInicio: LessThanOrEqual(momento),
          horaFin: MoreThanOrEqual(momento),
        },
      });
      if (!turnoVigente) {
        return this.guardarRegistro(dto, {
          empleadoId: empleado.id,
          turnoId: null,
          tipo: TipoRegistroAsistencia.SALIDA,
          timestamp: momento,
          anomalia: true,
          motivoAnomalia:
            'El empleado no tiene un turno vigente asignado para este evento.',
          horasCalculadas: null,
        });
      }
      turnoId = turnoVigente.id;
    }

    const entradaAbierta = await this.buscarEntradaAbierta(empleado.id, turnoId);

    if (!entradaAbierta) {
      return this.guardarRegistro(dto, {
        empleadoId: empleado.id,
        turnoId: turnoId ?? null,
        tipo: TipoRegistroAsistencia.SALIDA,
        timestamp: momento,
        anomalia: true,
        motivoAnomalia: 'Registro de salida sin una entrada previa.',
        horasCalculadas: null,
      });
    }

    const horasCalculadas =
      (momento.getTime() - entradaAbierta.timestamp.getTime()) / 3_600_000;

    empleado.horasTrabajadasTotales += horasCalculadas;
    await this.empleados.save(empleado);

    return this.guardarRegistro(dto, {
      empleadoId: empleado.id,
      turnoId: entradaAbierta.turnoId,
      tipo: TipoRegistroAsistencia.SALIDA,
      timestamp: momento,
      horasCalculadas,
    });
  }

  listarRegistros() {
    return this.registros.find({ order: { timestamp: 'DESC' } });
  }

  /**
   * Última ENTRADA del empleado (opcionalmente acotada a un turno/evento
   * específico) que todavía no tiene una SALIDA posterior. Sin esto, una
   * salida siempre cerraba "la última entrada que sea", sin comprobar si
   * ya estaba cerrada ni de qué turno era — lo que permitía que una
   * salida de un evento cerrara por error la entrada abierta de otro, o
   * que una segunda salida accidental volviera a contar las mismas horas.
   */
  private async buscarEntradaAbierta(empleadoId: string, turnoId?: string) {
    const entradas = await this.registros.find({
      where: {
        empleadoId,
        tipo: TipoRegistroAsistencia.ENTRADA,
        ...(turnoId ? { turnoId } : {}),
      },
      order: { timestamp: 'DESC' },
    });
    for (const entrada of entradas) {
      const salidaMasReciente = entrada.turnoId
        ? await this.registros.findOne({
            where: {
              empleadoId,
              turnoId: entrada.turnoId,
              tipo: TipoRegistroAsistencia.SALIDA,
            },
            order: { timestamp: 'DESC' },
          })
        : null;
      if (!salidaMasReciente || salidaMasReciente.timestamp < entrada.timestamp) {
        return entrada;
      }
    }
    return null;
  }

  private async buscarPorIdempotencyKey(idempotencyKey?: string) {
    if (!idempotencyKey) {
      return null;
    }
    return this.registros.findOne({ where: { idempotencyKey } });
  }

  private guardarRegistro(
    dto: RegistrarAsistenciaDto,
    datos: Partial<RegistroAsistencia> & { timestamp: Date },
  ) {
    const registro = this.registros.create({
      credencialUsada: dto.credencial,
      idempotencyKey: dto.idempotencyKey ?? null,
      sincronizadoEn: new Date(),
      ...datos,
    });
    return this.registros.save(registro);
  }

  private async buscarEmpleadoPorCredencial(credencial: string) {
    // CU-018D: credencial inválida -> rechaza el registro.
    const empleado = await this.empleados.findOne({
      where: { credencial, activo: true },
    });
    if (!empleado) {
      throw new UnauthorizedException(
        'Credencial inválida: no corresponde a ningún empleado activo.',
      );
    }
    return empleado;
  }
}
