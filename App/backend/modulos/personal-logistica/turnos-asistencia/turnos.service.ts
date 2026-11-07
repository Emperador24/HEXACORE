import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { auditar } from './auditoria-personal';
import { CrearTurnoDto } from './dto/crear-turno.dto';
import { RevisarSolicitudDto } from './dto/revisar-solicitud.dto';
import { SolicitarCambioTurnoDto } from './dto/solicitar-cambio-turno.dto';
import { AuditoriaPersonal } from './entities/auditoria-personal.entity';
import { Empleado } from './entities/empleado.entity';
import { SolicitudCambioTurno } from './entities/solicitud-cambio-turno.entity';
import { Turno } from './entities/turno.entity';
import { ConfirmacionTurno, EstadoSolicitudCambio, EstadoTurno, RespuestaReemplazo } from './enums/estados';
import { CambioTurnoEvento, EventosPublicadorService } from './eventos-publicador.service';
import { horasAsignadasEseDia } from './horas-del-dia';
import {
  MAX_HORAS_DIARIAS_EMPLEADO,
  MAX_HORAS_POR_TURNO,
} from './turnos-asistencia.constants';

@Injectable()
export class TurnosService {
  constructor(
    @InjectRepository(Empleado, CONEXION_LOGISTICA)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno, CONEXION_LOGISTICA)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(SolicitudCambioTurno, CONEXION_LOGISTICA)
    private readonly solicitudes: Repository<SolicitudCambioTurno>,
    @InjectRepository(AuditoriaPersonal, CONEXION_LOGISTICA)
    private readonly auditoria: Repository<AuditoriaPersonal>,
    private readonly eventosPublicador: EventosPublicadorService,
  ) {}

  listarEmpleados() {
    return this.empleados.find({ order: { nombre: 'ASC' } });
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
        // Un turno CAMBIADO es del reemplazo que lo recibió: sigue vigente.
        estado: Not(EstadoTurno.CANCELADO),
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
   * Las solicitudes de cambio que le tocan a un empleado: las que pidió y las
   * aprobadas que lo nombran reemplazo (CU-008, paso 12). Se mira también el turno,
   * para las solicitudes anteriores a `empleadoSolicitanteId`: al aprobarse,
   * el turno pasa al reemplazo y ya no dice quién lo pidió.
   *
   * Mismo criterio que `turnosDeEmpleado`: sin ficha, lista vacía.
   */
  async solicitudesDeEmpleado(empleadoId: string | null, estado?: string) {
    if (!empleadoId) return [];
    const turnosSuyos = await this.turnos.find({
      where: { empleadoId },
      select: { id: true },
    });
    const filtro = estado ? { estado: estado as EstadoSolicitudCambio } : {};
    return this.solicitudes.find({
      where: [
        { empleadoSolicitanteId: empleadoId, ...filtro },
        // Al reemplazo solo cuando ya le asignaron el turno: antes es una
        // propuesta, y el motivo del compañero no es asunto suyo.
        ...(!estado || estado === EstadoSolicitudCambio.APROBADA
          ? [{ empleadoReemplazoId: empleadoId, estado: EstadoSolicitudCambio.APROBADA }]
          : []),
        ...(turnosSuyos.length ? [{ turnoId: In(turnosSuyos.map((turno) => turno.id)), ...filtro }] : []),
      ],
      order: { fechaSolicitud: 'DESC' },
    });
  }

  // --- CU-008: cambios de turno ---------------------------------------------

  /**
   * CU-008, pasos 1-4 (y CU-018A): el empleado pide el cambio con un motivo,
   * el sistema registra la solicitud con un reemplazo propuesto (mismo rol,
   * activo, sin choque de horario ni tope diario) y avisa al supervisor. Sin
   * nadie que pueda cubrirlo la solicitud queda SIN_REEMPLAZO y el turno sigue
   * igual.
   */
  async solicitarCambio(
    turnoId: string,
    dto: SolicitarCambioTurnoDto,
    quienPide: { empleadoId: string | null; supervisa: boolean; usuarioId: string },
  ) {
    const { guardada, turno, reemplazo } = await this.turnos.manager.transaction(async (m) => {
      const turno = await m.findOne(Turno, { where: { id: turnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!turno) {
        throw new NotFoundException('Turno no encontrado.');
      }
      // El cambio de turno lo pide quien lo trabaja (paso 1). El jefe puede
      // hacerlo en nombre de cualquiera; el resto, solo del suyo.
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
      if (turno.horaFin <= new Date()) {
        throw new BadRequestException('El turno ya terminó: no se puede cambiar.');
      }

      const solicitante = await m.findOneByOrFail(Empleado, { id: turno.empleadoId });
      const [reemplazo] = (await this.reemplazosPara(m, turno, solicitante.rol, [])).filter((c) => c.disponible);

      const guardada = await m.save(
        m.create(SolicitudCambioTurno, {
          turnoId,
          motivo: dto.motivo.trim(),
          empleadoSolicitanteId: solicitante.id,
          empleadoReemplazoId: reemplazo?.empleado.id ?? null,
          estado: reemplazo ? EstadoSolicitudCambio.PENDIENTE : EstadoSolicitudCambio.SIN_REEMPLAZO,
          reemplazosDescartados: [],
        }),
      );
      if (reemplazo) {
        await m.update(Turno, { id: turno.id }, { estado: EstadoTurno.CAMBIO_SOLICITADO });
      }
      await auditar(m, {
        accion: 'CAMBIO_SOLICITADO',
        realizadoPor: quienPide.usuarioId,
        empleadoId: solicitante.id,
        turnoId,
        detalle: { solicitudId: guardada.id, motivo: guardada.motivo, reemplazoPropuesto: reemplazo?.empleado.id ?? null },
      });
      return { guardada, turno, reemplazo };
    });

    if (!reemplazo) {
      // CU-018A: sin reemplazo disponible, se informa al empleado.
      return {
        solicitud: await this.solicitudes.findOneBy({ id: guardada.id }),
        mensaje:
          'No hay personal de reemplazo disponible para este turno. No es posible el cambio.',
      };
    }

    // Paso 4: aviso al supervisor, por la cola y fuera de la transacción.
    await this.notificar('CAMBIO_SOLICITADO', turno.id, turno.empleadoId,
      `Solicitud de cambio del turno en "${turno.zona}" pendiente de revisión: ${guardada.motivo}`);
    return { solicitud: await this.solicitudes.findOneBy({ id: guardada.id }) };
  }

  /**
   * CU-008, paso 6: los posibles reemplazos de una solicitud, con su
   * disponibilidad y el motivo cuando no lo están. Mismas reglas que la
   * aprobación: lo que aquí sale disponible es lo que la aprobación acepta.
   */
  async reemplazosPosibles(solicitudId: string) {
    const solicitud = await this.solicitudes.findOneBy({ id: solicitudId });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');
    const turno = await this.turnos.findOneBy({ id: solicitud.turnoId });
    if (!turno) throw new NotFoundException('Turno asociado no encontrado.');
    const solicitanteId = solicitud.empleadoSolicitanteId ?? turno.empleadoId;
    const solicitante = await this.empleados.findOneBy({ id: solicitanteId });
    if (!solicitante) throw new NotFoundException('Empleado solicitante no encontrado.');
    const turnoDelSolicitante = { ...turno, empleadoId: solicitanteId } as Turno;
    return {
      solicitudId,
      propuestoId: solicitud.empleadoReemplazoId,
      candidatos: await this.reemplazosPara(this.turnos.manager, turnoDelSolicitante, solicitante.rol, solicitud.reemplazosDescartados ?? []),
    };
  }

  /**
   * CU-008, pasos 5-13 + CU-008A + CU-018C: el supervisor aprueba (con el
   * reemplazo que eligió o el propuesto) o rechaza. Al aprobar se vuelve a
   * comprobar la disponibilidad del reemplazo (paso 8) y el límite de horas;
   * el turno pasa al reemplazo, que queda pendiente de confirmarlo.
   */
  async revisarSolicitud(
    solicitudId: string,
    dto: RevisarSolicitudDto & { supervisorId: string },
  ) {
    const resultado = await this.turnos.manager.transaction(async (m) => {
      const solicitud = await m.findOne(SolicitudCambioTurno, {
        where: { id: solicitudId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!solicitud) {
        throw new NotFoundException('Solicitud no encontrada.');
      }
      if (solicitud.estado !== EstadoSolicitudCambio.PENDIENTE) {
        throw new BadRequestException(
          `La solicitud no está pendiente de revisión (estado actual: ${solicitud.estado}).`,
        );
      }
      const turno = await m.findOne(Turno, { where: { id: solicitud.turnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!turno) {
        throw new NotFoundException('Turno asociado no encontrado.');
      }
      const solicitanteId = solicitud.empleadoSolicitanteId ?? turno.empleadoId;
      solicitud.revisadoPorId = dto.supervisorId;
      solicitud.fechaRevision = new Date();

      if (!dto.aprobar) {
        // CU-008A: el supervisor rechaza y el turno sigue con quien lo tenía.
        solicitud.estado = EstadoSolicitudCambio.RECHAZADA;
        solicitud.motivoRechazoOBloqueo = dto.motivo?.trim() ?? null;
        await m.update(Turno, { id: turno.id }, { estado: EstadoTurno.ASIGNADO });
        await m.save(solicitud);
        await auditar(m, {
          accion: 'CAMBIO_RECHAZADO', realizadoPor: dto.supervisorId, empleadoId: solicitanteId, turnoId: turno.id,
          detalle: { solicitudId, motivo: solicitud.motivoRechazoOBloqueo },
        });
        return { tipo: 'rechazada' as const, turno, solicitanteId };
      }

      // Paso 7-8: el elegido por el supervisor, o el que propuso el sistema.
      const reemplazoId = dto.reemplazoId ?? solicitud.empleadoReemplazoId;
      if (!reemplazoId) {
        throw new BadRequestException({ codigo: 'FALTA_REEMPLAZO', mensaje: 'Elige un reemplazo para aprobar el cambio.' });
      }
      const solicitante = await m.findOneByOrFail(Empleado, { id: solicitanteId });
      const candidato = (await this.reemplazosPara(m, turno, solicitante.rol, solicitud.reemplazosDescartados ?? []))
        .find((c) => c.empleado.id === reemplazoId);
      if (!candidato || !candidato.disponible) {
        throw new ConflictException({
          codigo: 'REEMPLAZO_NO_DISPONIBLE',
          mensaje: candidato?.motivo ?? 'Ese empleado no puede cubrir el turno: no tiene el mismo rol, no está activo o ya lo rechazó.',
        });
      }
      const reemplazo = candidato.empleado;

      // CU-018C: el cambio supera el límite de horas. Se compara contra lo que
      // el reemplazo ya tiene asignado **ese día** (ver `horas-del-dia.ts`).
      const duracionTurnoHoras = (turno.horaFin.getTime() - turno.horaInicio.getTime()) / 3_600_000;
      const horasEseDia = await horasAsignadasEseDia(m.getRepository(Turno), reemplazo.id, turno.horaInicio, turno.id);
      if (duracionTurnoHoras > MAX_HORAS_POR_TURNO || horasEseDia + duracionTurnoHoras > MAX_HORAS_DIARIAS_EMPLEADO) {
        solicitud.estado = EstadoSolicitudCambio.BLOQUEADA_POR_HORAS;
        solicitud.motivoRechazoOBloqueo = 'El cambio solicitado supera el límite de horas permitidas por turno.';
        await m.update(Turno, { id: turno.id }, { estado: EstadoTurno.ASIGNADO });
        await m.save(solicitud);
        await auditar(m, {
          accion: 'CAMBIO_BLOQUEADO', realizadoPor: dto.supervisorId, empleadoId: solicitanteId, turnoId: turno.id,
          detalle: { solicitudId, reemplazoId: reemplazo.id, horasEseDia, duracionTurnoHoras },
        });
        return { tipo: 'bloqueada' as const, turno, solicitanteId };
      }

      // Paso 10: el turno pasa al reemplazo, que debe confirmarlo (paso 12).
      solicitud.estado = EstadoSolicitudCambio.APROBADA;
      solicitud.empleadoReemplazoId = reemplazo.id;
      solicitud.empleadoSolicitanteId = solicitanteId;
      solicitud.respuestaReemplazo = RespuestaReemplazo.PENDIENTE;
      await m.update(Turno, { id: turno.id }, {
        empleadoId: reemplazo.id, estado: EstadoTurno.CAMBIADO, confirmacion: ConfirmacionTurno.PENDIENTE, respondidoEn: null,
      });
      await m.save(solicitud);
      // Paso 13: el historial del cambio.
      await auditar(m, {
        accion: 'CAMBIO_APROBADO', realizadoPor: dto.supervisorId, empleadoId: solicitanteId, turnoId: turno.id,
        detalle: { solicitudId, empleadoAnteriorId: solicitanteId, empleadoNuevoId: reemplazo.id, elegidoPorSupervisor: !!dto.reemplazoId },
      });
      return { tipo: 'aprobada' as const, turno, solicitanteId, reemplazo };
    });

    const { turno, solicitanteId } = resultado;
    if (resultado.tipo === 'aprobada') {
      // Pasos 11-12, por cola de mensajes y fuera de la transacción.
      await this.eventosPublicador.publicarCambioTurno({
        tipo: 'TURNO_CAMBIADO',
        turnoId: turno.id,
        empleadoAnteriorId: solicitanteId,
        empleadoNuevoId: resultado.reemplazo.id,
        mensaje: `Se te asignó el turno ${turno.id} por cambio aprobado.`,
      });
      await this.notificar('CAMBIO_APROBADO', turno.id, solicitanteId,
        `Se aprobó tu cambio del turno en "${turno.zona}": lo cubre ${resultado.reemplazo.nombre}.`);
    } else if (resultado.tipo === 'rechazada') {
      await this.notificar('CAMBIO_RECHAZADO', turno.id, solicitanteId,
        `Se rechazó tu solicitud de cambio del turno en "${turno.zona}"${dto.motivo ? `: ${dto.motivo.trim()}` : '.'}`);
    } else {
      await this.notificar('CAMBIO_RECHAZADO', turno.id, solicitanteId,
        `Tu cambio del turno en "${turno.zona}" no procede: supera el límite de horas permitidas.`);
    }
    return this.solicitudes.findOneBy({ id: solicitudId });
  }

  /**
   * CU-008B: quien pidió el cambio lo retira antes de que lo revisen. El
   * turno vuelve a estar asignado como antes.
   */
  async cancelarSolicitud(
    solicitudId: string,
    motivo: string | undefined,
    quien: { empleadoId: string | null; supervisa: boolean; usuarioId: string },
  ) {
    const turno = await this.turnos.manager.transaction(async (m) => {
      const solicitud = await m.findOne(SolicitudCambioTurno, { where: { id: solicitudId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');
      const turno = await m.findOne(Turno, { where: { id: solicitud.turnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!turno) throw new NotFoundException('Turno asociado no encontrado.');
      const solicitanteId = solicitud.empleadoSolicitanteId ?? turno.empleadoId;
      if (!quien.supervisa && solicitanteId !== quien.empleadoId) {
        throw new ForbiddenException({ codigo: 'SOLICITUD_AJENA', mensaje: 'Solo puedes cancelar tus propias solicitudes.' });
      }
      if (solicitud.estado !== EstadoSolicitudCambio.PENDIENTE && solicitud.estado !== EstadoSolicitudCambio.SIN_REEMPLAZO) {
        throw new ConflictException({
          codigo: 'SOLICITUD_YA_REVISADA',
          mensaje: `La solicitud ya no se puede cancelar (estado actual: ${solicitud.estado}).`,
        });
      }
      solicitud.estado = EstadoSolicitudCambio.CANCELADA;
      solicitud.motivoRechazoOBloqueo = motivo?.trim() ?? null;
      solicitud.fechaRevision = new Date();
      await m.save(solicitud);
      if (turno.estado === EstadoTurno.CAMBIO_SOLICITADO) {
        await m.update(Turno, { id: turno.id }, { estado: EstadoTurno.ASIGNADO });
      }
      await auditar(m, {
        accion: 'CAMBIO_CANCELADO', realizadoPor: quien.usuarioId, empleadoId: solicitanteId, turnoId: turno.id,
        detalle: { solicitudId, motivo: solicitud.motivoRechazoOBloqueo },
      });
      return turno;
    });
    await this.notificar('CAMBIO_CANCELADO', turno.id, turno.empleadoId,
      `Se retiró la solicitud de cambio del turno en "${turno.zona}".`);
    return this.solicitudes.findOneBy({ id: solicitudId });
  }

  /**
   * CU-008, paso 12 y CU-008C: el reemplazo confirma o rechaza el turno que
   * le asignaron. Si lo rechaza, el turno vuelve a quien lo pidió y la
   * solicitud regresa a revisión con otro reemplazo propuesto, sin volver a
   * proponer a quien ya dijo que no. Si no queda nadie, el turno sigue con su
   * dueño original y la solicitud queda SIN_REEMPLAZO.
   */
  async responderReemplazo(
    solicitudId: string,
    respuesta: { aceptar: boolean; motivo?: string },
    quien: { empleadoId: string | null; usuarioId: string },
  ) {
    const resultado = await this.turnos.manager.transaction(async (m) => {
      const solicitud = await m.findOne(SolicitudCambioTurno, { where: { id: solicitudId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');
      if (!quien.empleadoId || solicitud.empleadoReemplazoId !== quien.empleadoId) {
        throw new ForbiddenException({ codigo: 'NO_ERES_EL_REEMPLAZO', mensaje: 'Solo el reemplazo asignado puede responder.' });
      }
      if (solicitud.estado !== EstadoSolicitudCambio.APROBADA || solicitud.respuestaReemplazo !== RespuestaReemplazo.PENDIENTE) {
        throw new ConflictException({ codigo: 'SIN_RESPUESTA_PENDIENTE', mensaje: 'Este cambio ya no espera tu respuesta.' });
      }
      const turno = await m.findOne(Turno, { where: { id: solicitud.turnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!turno) throw new NotFoundException('Turno asociado no encontrado.');
      if (turno.horaFin <= new Date()) {
        throw new ConflictException({ codigo: 'TURNO_TERMINADO', mensaje: 'El turno ya terminó.' });
      }

      if (respuesta.aceptar) {
        solicitud.respuestaReemplazo = RespuestaReemplazo.ACEPTADA;
        await m.save(solicitud);
        await m.update(Turno, { id: turno.id }, { confirmacion: ConfirmacionTurno.CONFIRMADA, respondidoEn: new Date() });
        await auditar(m, { accion: 'REEMPLAZO_ACEPTO', realizadoPor: quien.usuarioId, empleadoId: quien.empleadoId, turnoId: turno.id, detalle: { solicitudId } });
        return { aceptado: true as const, turno, solicitanteId: solicitud.empleadoSolicitanteId! };
      }

      // CU-008C: el turno vuelve a su dueño y se busca otro reemplazo.
      const solicitanteId = solicitud.empleadoSolicitanteId!;
      const solicitante = await m.findOneByOrFail(Empleado, { id: solicitanteId });
      const descartados = [...(solicitud.reemplazosDescartados ?? []), quien.empleadoId];
      const turnoOriginal = { ...turno, empleadoId: solicitanteId } as Turno;
      const [siguiente] = (await this.reemplazosPara(m, turnoOriginal, solicitante.rol, descartados)).filter((c) => c.disponible);

      solicitud.reemplazosDescartados = descartados;
      solicitud.respuestaReemplazo = null;
      solicitud.empleadoReemplazoId = siguiente?.empleado.id ?? null;
      solicitud.estado = siguiente ? EstadoSolicitudCambio.PENDIENTE : EstadoSolicitudCambio.SIN_REEMPLAZO;
      solicitud.motivoRechazoOBloqueo = respuesta.motivo!.trim();
      await m.save(solicitud);
      await m.update(Turno, { id: turno.id }, {
        empleadoId: solicitanteId,
        estado: siguiente ? EstadoTurno.CAMBIO_SOLICITADO : EstadoTurno.ASIGNADO,
        confirmacion: ConfirmacionTurno.CONFIRMADA,
      });
      await auditar(m, {
        accion: 'REEMPLAZO_RECHAZO', realizadoPor: quien.usuarioId, empleadoId: quien.empleadoId, turnoId: turno.id,
        detalle: { solicitudId, motivo: solicitud.motivoRechazoOBloqueo, nuevoPropuesto: siguiente?.empleado.id ?? null },
      });
      return { aceptado: false as const, turno, solicitanteId, hayOtro: !!siguiente };
    });

    if (!resultado.aceptado) {
      await this.notificar('REEMPLAZO_RECHAZO', resultado.turno.id, resultado.solicitanteId,
        resultado.hayOtro
          ? `El reemplazo rechazó cubrir tu turno en "${resultado.turno.zona}"; el supervisor debe revisar otro.`
          : `El reemplazo rechazó cubrir tu turno en "${resultado.turno.zona}" y no hay otro disponible: el turno sigue siendo tuyo.`);
    }
    return this.solicitudes.findOneBy({ id: solicitudId });
  }

  /** CU-008, paso 13: el historial auditable de una solicitud de cambio. */
  async historialSolicitud(solicitudId: string) {
    const solicitud = await this.solicitudes.findOneBy({ id: solicitudId });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada.');
    const eventos = await this.auditoria
      .createQueryBuilder('a')
      .where(`a.detalle ->> 'solicitudId' = :solicitudId`, { solicitudId })
      .orderBy('a.fecha', 'ASC')
      .getMany();
    return { solicitud, eventos };
  }

  /**
   * Quiénes pueden cubrir `turno`: mismo rol, activos, distintos de su
   * titular y de los descartados. Disponible si no tienen otro turno que se
   * cruce (consistencia: nadie con dos turnos simultáneos) y no pasan del
   * tope diario.
   *
   * Si el turno por sí solo supera el máximo por turno se proponen igual: es
   * un problema del turno, no del candidato, y la aprobación lo bloquea
   * diciendo por qué (CU-018C).
   */
  private async reemplazosPara(m: EntityManager, turno: Turno, rol: string, descartados: string[]) {
    const candidatos = await m.find(Empleado, {
      where: { rol, activo: true, id: Not(In([turno.empleadoId, ...descartados])) },
      order: { nombre: 'ASC' },
      loadEagerRelations: false,
    });
    const duracion = (turno.horaFin.getTime() - turno.horaInicio.getTime()) / 3_600_000;
    const resultado: { empleado: Empleado; disponible: boolean; motivo: string | null; horasEseDia: number }[] = [];
    for (const empleado of candidatos) {
      const choque = await m.findOne(Turno, {
        where: {
          empleadoId: empleado.id,
          id: Not(turno.id),
          estado: Not(EstadoTurno.CANCELADO),
          horaInicio: LessThan(turno.horaFin),
          horaFin: MoreThan(turno.horaInicio),
        },
        loadEagerRelations: false,
      });
      const horasEseDia = await horasAsignadasEseDia(m.getRepository(Turno), empleado.id, turno.horaInicio, turno.id);
      let motivo: string | null = null;
      if (choque) motivo = `Ya tiene un turno en "${choque.zona}" que se cruza con ese horario.`;
      else if (duracion <= MAX_HORAS_POR_TURNO && horasEseDia + duracion > MAX_HORAS_DIARIAS_EMPLEADO) {
        motivo = `Superaría ${MAX_HORAS_DIARIAS_EMPLEADO} h ese día (ya tiene ${horasEseDia.toFixed(1)} h).`;
      }
      resultado.push({ empleado, disponible: motivo === null, motivo, horasEseDia });
    }
    return resultado.sort((a, b) => Number(b.disponible) - Number(a.disponible) || a.horasEseDia - b.horasEseDia);
  }

  /** Los avisos viajan por la cola de CU-017/018, siempre después de confirmar. */
  private notificar(tipo: CambioTurnoEvento['tipo'], turnoId: string, empleadoId: string, mensaje: string) {
    return this.eventosPublicador.publicarCambioTurno({ tipo, turnoId, empleadoNuevoId: empleadoId, mensaje });
  }
}
