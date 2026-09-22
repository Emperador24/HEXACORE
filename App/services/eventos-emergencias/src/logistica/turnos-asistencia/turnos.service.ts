import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Not, QueryFailedError, Repository } from 'typeorm';
import { CrearEmpleadoDto } from './dto/crear-empleado.dto.js';
import { CrearTurnoDto } from './dto/crear-turno.dto.js';
import { RevisarSolicitudDto } from './dto/revisar-solicitud.dto.js';
import { SolicitarCambioTurnoDto } from './dto/solicitar-cambio-turno.dto.js';
import { Empleado } from './entities/empleado.entity.js';
import { SolicitudCambioTurno } from './entities/solicitud-cambio-turno.entity.js';
import { Turno } from './entities/turno.entity.js';
import { EstadoSolicitudCambio, EstadoTurno } from './enums/estados.js';
import { EventosPublicadorService } from './eventos-publicador.service.js';
import { horasAsignadasEseDia } from './horas-del-dia.js';
import {
  MAX_HORAS_DIARIAS_EMPLEADO,
  MAX_HORAS_POR_TURNO,
} from './turnos-asistencia.constants.js';

@Injectable()
export class TurnosService {
  constructor(
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(SolicitudCambioTurno)
    private readonly solicitudes: Repository<SolicitudCambioTurno>,
    private readonly eventosPublicador: EventosPublicadorService,
  ) {}

  async crearEmpleado(dto: CrearEmpleadoDto) {
    const empleado = this.empleados.create(dto);
    try {
      return await this.empleados.save(empleado);
    } catch (error) {
      // Violación de la restricción unique(credencial) en Postgres.
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === '23505') {
        throw new ConflictException(
          `Ya existe un empleado con la credencial "${dto.credencial}".`,
        );
      }
      throw error;
    }
  }

  listarEmpleados() {
    return this.empleados.find();
  }

  /**
   * La ficha del empleado de una cuenta, o `null` si esa cuenta no es empleada.
   *
   * Es lo que la app pregunta nada más iniciar sesión para saber **a qué área
   * pertenece quien entró**, y por tanto qué pantallas mostrarle. Devuelve
   * `null` en vez de lanzar: no ser empleado no es un error, es el caso de
   * cualquier cliente.
   */
  async fichaDeUsuario(usuarioId: string) {
    const empleado = await this.empleados.findOneBy({ usuarioId, activo: true });
    if (!empleado) return null;

    const ahora = new Date();
    const turnoVigente = await this.turnos.findOne({
      where: {
        empleadoId: empleado.id,
        horaInicio: LessThan(ahora),
        horaFin: MoreThan(ahora),
        estado: Not(EstadoTurno.CAMBIADO),
      },
    });

    return { empleado, turnoVigente: turnoVigente ?? null };
  }

  async crearTurno(dto: CrearTurnoDto) {
    const empleado = await this.empleados.findOneBy({ id: dto.empleadoId });
    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado.');
    }
    if (new Date(dto.horaFin) <= new Date(dto.horaInicio)) {
      throw new BadRequestException('horaFin debe ser posterior a horaInicio.');
    }
    const turno = this.turnos.create({
      ...dto,
      horaInicio: new Date(dto.horaInicio),
      horaFin: new Date(dto.horaFin),
    });
    return this.turnos.save(turno);
  }

  listarTurnos() {
    return this.turnos.find();
  }

  /** Los turnos de un empleado. Sin empleado, ninguno — nunca todos. */
  turnosDeEmpleado(empleadoId: string | null) {
    if (!empleadoId) return Promise.resolve([]);
    return this.turnos.find({ where: { empleadoId } });
  }

  listarSolicitudes(estado?: string) {
    if (estado) {
      return this.solicitudes.find({
        where: { estado: estado as EstadoSolicitudCambio },
        order: { fechaSolicitud: 'DESC' },
      });
    }
    return this.solicitudes.find({ order: { fechaSolicitud: 'DESC' } });
  }

  /**
   * Las solicitudes de cambio de un empleado: las que pidió él.
   *
   * Mismo criterio que `turnosDeEmpleado`: sin ficha, lista vacía.
   */
  async solicitudesDeEmpleado(empleadoId: string | null, estado?: string) {
    if (!empleadoId) return [];
    const turnosSuyos = await this.turnos.find({
      where: { empleadoId },
      select: { id: true },
    });
    if (turnosSuyos.length === 0) return [];
    return this.solicitudes.find({
      where: {
        turnoId: In(turnosSuyos.map((turno) => turno.id)),
        ...(estado ? { estado: estado as EstadoSolicitudCambio } : {}),
      },
      order: { fechaSolicitud: 'DESC' },
    });
  }

  /**
   * CU-LOG-003, pasos 1-2 + alterno A: el empleado solicita cambio de turno
   * y el sistema busca disponibilidad de reemplazo (mismo rol, misma zona,
   * sin choque de horario, activo, distinto del solicitante).
   */
  async solicitarCambio(
    turnoId: string,
    dto: SolicitarCambioTurnoDto,
    quienPide: { empleadoId: string | null; supervisa: boolean },
  ) {
    const turno = await this.turnos.findOneBy({ id: turnoId });
    if (!turno) {
      throw new NotFoundException('Turno no encontrado.');
    }
    // El cambio de turno lo pide quien lo trabaja (CU-018, paso 1). El jefe
    // puede hacerlo en nombre de cualquiera; el resto, solo del suyo.
    if (!quienPide.supervisa && turno.empleadoId !== quienPide.empleadoId) {
      throw new ForbiddenException({
        codigo: 'TURNO_AJENO',
        mensaje: 'Solo puedes pedir el cambio de tus propios turnos.',
      });
    }
    if (turno.estado !== EstadoTurno.ASIGNADO) {
      throw new BadRequestException(
        `El turno no está en un estado que permita solicitar cambio (estado actual: ${turno.estado}).`,
      );
    }

    const solicitante = await this.empleados.findOneBy({
      id: turno.empleadoId,
    });
    const reemplazo = await this.buscarReemplazoDisponible(turno, solicitante!.rol);

    const solicitud = this.solicitudes.create({
      turnoId,
      motivo: dto.motivo,
      empleadoReemplazoId: reemplazo?.id ?? null,
      estado: reemplazo
        ? EstadoSolicitudCambio.PENDIENTE
        : EstadoSolicitudCambio.SIN_REEMPLAZO,
    });
    const guardada = await this.solicitudes.save(solicitud);

    if (!reemplazo) {
      // CU-LOG-003A: sin reemplazo disponible, se informa al empleado.
      return {
        solicitud: guardada,
        mensaje:
          'No hay personal de reemplazo disponible para este turno. No es posible el cambio.',
      };
    }

    turno.estado = EstadoTurno.CAMBIO_SOLICITADO;
    await this.turnos.save(turno);

    return { solicitud: guardada };
  }

  private async buscarReemplazoDisponible(
    turno: Turno,
    rol: string,
  ): Promise<Empleado | null> {
    const candidatos = await this.empleados.find({
      where: { rol, activo: true, id: Not(turno.empleadoId) },
    });

    const duracion = (turno.horaFin.getTime() - turno.horaInicio.getTime()) / 3_600_000;

    for (const candidato of candidatos) {
      const choque = await this.turnos.findOne({
        where: [
          {
            empleadoId: candidato.id,
            estado: EstadoTurno.ASIGNADO,
            horaInicio: LessThan(turno.horaFin),
            horaFin: MoreThan(turno.horaInicio),
          },
        ],
      });
      if (choque) continue;

      // No basta con que el horario no choque: si ese día ya tiene turnos que
      // sumados al de la solicitud pasan del tope diario, proponerlo sería
      // proponer a alguien a quien después se le va a negar la aprobación
      // (excepción CU-LOG-003C). Se descarta aquí y se sigue buscando.
      //
      // Salvo que el turno **por sí solo** pase del máximo por turno: eso es un
      // problema del turno, no del candidato, y descartarlos a todos por esa
      // causa devolvería «no hay reemplazo» cuando la razón real es otra. En
      // ese caso se propone igual y la aprobación lo bloquea, diciendo por qué.
      if (duracion <= MAX_HORAS_POR_TURNO) {
        const horasEseDia = await horasAsignadasEseDia(
          this.turnos,
          candidato.id,
          turno.horaInicio,
        );
        if (horasEseDia + duracion > MAX_HORAS_DIARIAS_EMPLEADO) continue;
      }

      return candidato;
    }
    return null;
  }

  /**
   * CU-LOG-003, pasos 3-4 + alterno B + excepción C: el supervisor aprueba
   * o rechaza el cambio; si aprueba, se valida el límite de horas antes de
   * reasignar el turno.
   */
  async revisarSolicitud(
    solicitudId: string,
    dto: RevisarSolicitudDto & { supervisorId: string },
  ) {
    const solicitud = await this.solicitudes.findOneBy({ id: solicitudId });
    if (!solicitud) {
      throw new NotFoundException('Solicitud no encontrada.');
    }
    if (solicitud.estado !== EstadoSolicitudCambio.PENDIENTE) {
      throw new BadRequestException(
        `La solicitud no está pendiente de revisión (estado actual: ${solicitud.estado}).`,
      );
    }

    const turno = await this.turnos.findOneBy({ id: solicitud.turnoId });
    if (!turno) {
      throw new NotFoundException('Turno asociado no encontrado.');
    }

    if (!dto.aprobar) {
      // CU-LOG-003B: el supervisor rechaza, se mantiene el turno original.
      solicitud.estado = EstadoSolicitudCambio.RECHAZADA;
      solicitud.revisadoPorId = dto.supervisorId;
      solicitud.fechaRevision = new Date();
      turno.estado = EstadoTurno.ASIGNADO;
      await this.turnos.save(turno);
      solicitud.turno = turno;
      return this.solicitudes.save(solicitud);
    }

    const reemplazo = await this.empleados.findOneBy({
      id: solicitud.empleadoReemplazoId!,
    });
    const duracionTurnoHoras =
      (turno.horaFin.getTime() - turno.horaInicio.getTime()) / 3_600_000;

    // Excepción CU-LOG-003C: el cambio supera el límite de horas permitidas.
    //
    // Se compara contra lo que el reemplazo ya tiene asignado **ese día**, no
    // contra su acumulado de por vida: con lo segundo, quien llevara un par de
    // turnos trabajados no podía volver a cubrir a nadie. Ver `horas-del-dia.ts`.
    const horasEseDia = await horasAsignadasEseDia(
      this.turnos,
      reemplazo!.id,
      turno.horaInicio,
      turno.id,
    );
    if (
      duracionTurnoHoras > MAX_HORAS_POR_TURNO ||
      horasEseDia + duracionTurnoHoras > MAX_HORAS_DIARIAS_EMPLEADO
    ) {
      solicitud.estado = EstadoSolicitudCambio.BLOQUEADA_POR_HORAS;
      solicitud.revisadoPorId = dto.supervisorId;
      solicitud.fechaRevision = new Date();
      solicitud.motivoRechazoOBloqueo =
        'El cambio solicitado supera el límite de horas permitidas por turno.';
      turno.estado = EstadoTurno.ASIGNADO;
      await this.turnos.save(turno);
      solicitud.turno = turno;
      return this.solicitudes.save(solicitud);
    }

    solicitud.estado = EstadoSolicitudCambio.APROBADA;
    solicitud.revisadoPorId = dto.supervisorId;
    solicitud.fechaRevision = new Date();

    const empleadoAnteriorId = turno.empleadoId;
    // `turno.empleado` viene eager-cargado apuntando al empleado anterior;
    // hay que reasignar también la relación, no solo la FK cruda, porque
    // TypeORM prioriza el objeto de la relación al calcular la columna al
    // guardar (si no, el save() revierte silenciosamente el cambio de FK).
    turno.empleado = reemplazo!;
    turno.empleadoId = reemplazo!.id;
    turno.estado = EstadoTurno.CAMBIADO;
    await this.turnos.save(turno);
    solicitud.turno = turno;

    const guardada = await this.solicitudes.save(solicitud);

    // Infraestructura no trivial de CU-018: propaga el cambio por cola de
    // mensajes en vez de notificar síncronamente dentro de esta petición.
    await this.eventosPublicador.publicarCambioTurno({
      tipo: 'TURNO_CAMBIADO',
      turnoId: turno.id,
      empleadoAnteriorId,
      empleadoNuevoId: reemplazo!.id,
      mensaje: `Se te asignó el turno ${turno.id} por cambio aprobado.`,
    });

    return guardada;
  }
}
