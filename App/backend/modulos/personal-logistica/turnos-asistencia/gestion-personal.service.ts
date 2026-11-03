import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, LessThan, MoreThan, Not, QueryFailedError, Repository } from 'typeorm';
import { auditar } from './auditoria-personal';
import { ActualizarEmpleadoDto } from './dto/actualizar-empleado.dto';
import { CrearEmpleadoDto } from './dto/crear-empleado.dto';
import { ResponderAsignacionDto } from './dto/responder-asignacion.dto';
import { AuditoriaPersonal } from './entities/auditoria-personal.entity';
import { Empleado } from './entities/empleado.entity';
import { SolicitudCambioTurno } from './entities/solicitud-cambio-turno.entity';
import { Turno } from './entities/turno.entity';
import { ZonaEvento } from './entities/zona-evento.entity';
import { ConfirmacionTurno, EstadoSolicitudCambio, EstadoTurno } from './enums/estados';
import { CambioTurnoEvento, EventosPublicadorService } from './eventos-publicador.service';
import { horasAsignadasEseDia } from './horas-del-dia';
import { MAX_HORAS_DIARIAS_EMPLEADO, MAX_HORAS_POR_TURNO } from './turnos-asistencia.constants';

/** Estados en los que un turno sigue comprometiendo al empleado. */
const TURNO_VIGENTE = [EstadoTurno.ASIGNADO, EstadoTurno.CAMBIO_SOLICITADO];

/** Campos únicos de la ficha, con el texto que ve quien da de alta. */
const UNICOS = [
  ['usuarioId', 'Esa cuenta ya tiene una ficha de empleado.'],
  ['credencial', 'Ya existe un empleado con la credencial'],
  ['documento', 'Ya existe un empleado con el documento'],
  ['correo', 'Ya existe un empleado con el correo'],
] as const;

type DatosFicha = Partial<Pick<Empleado, 'usuarioId' | 'credencial' | 'documento' | 'correo'>>;

/**
 * CU-007: gestión de personal para eventos.
 *
 * La asignación en sí (rol, choque de horario, límite de horas) sigue en
 * `PersonalOperativoService`, que ya la resolvía para CU-017: aquí está lo que
 * faltaba alrededor —ficha completa, edición, baja, candidatos con su
 * disponibilidad, la respuesta del empleado y la auditoría—, sin duplicar
 * reglas.
 */
@Injectable()
export class GestionPersonalService {
  constructor(
    @InjectRepository(Empleado, CONEXION_LOGISTICA)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno, CONEXION_LOGISTICA)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(ZonaEvento, CONEXION_LOGISTICA)
    private readonly zonas: Repository<ZonaEvento>,
    @InjectRepository(AuditoriaPersonal, CONEXION_LOGISTICA)
    private readonly auditoria: Repository<AuditoriaPersonal>,
    private readonly eventosPublicador: EventosPublicadorService,
  ) {}

  // --- Ficha del empleado (pasos 2-5 y CU-007A) -----------------------------

  /** Pasos 3-5: valida, comprueba duplicados y guarda, con su rastro. */
  async crear(dto: CrearEmpleadoDto, realizadoPor: string) {
    const datos = normalizar(dto);
    return this.conUnicidad(() =>
      this.empleados.manager.transaction(async (m) => {
        await this.comprobarDuplicados(m, datos);
        const empleado = await m.save(m.create(Empleado, datos));
        await auditar(m, {
          accion: 'EMPLEADO_CREADO',
          realizadoPor,
          empleadoId: empleado.id,
          detalle: { nombre: empleado.nombre, rol: empleado.rol },
        });
        return empleado;
      }),
    );
  }

  /** CU-007A: ficha, sus turnos y lo que se ha hecho con ella. */
  async detalle(id: string) {
    const empleado = await this.buscar(id);
    const [turnos, auditoria] = await Promise.all([
      this.turnos.find({ where: { empleadoId: id }, order: { horaInicio: 'DESC' }, take: 50 }),
      this.auditoria.find({ where: { empleadoId: id }, order: { fecha: 'DESC' }, take: 50 }),
    ]);
    return { empleado, turnos, auditoria };
  }

  /** Paso 3 (actualizar). Solo cambia lo enviado; la auditoría guarda antes y después. */
  async actualizar(id: string, dto: ActualizarEmpleadoDto, realizadoPor: string) {
    const datos = normalizar(dto);
    return this.conUnicidad(() =>
      this.empleados.manager.transaction(async (m) => {
        const empleado = await m.findOne(Empleado, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!empleado) throw new NotFoundException('Empleado no encontrado.');

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        for (const [campo, valor] of Object.entries(datos) as [keyof Empleado, unknown][]) {
          if (valor !== undefined && empleado[campo] !== valor) {
            cambios[campo] = { antes: empleado[campo], despues: valor };
          }
        }
        if (Object.keys(cambios).length === 0) return empleado;

        // Cambiar el rol de quien ya cubre zonas de ese rol dejaría turnos
        // asignados a alguien que ya no cumple el requisito (paso 9). Primero
        // se reasignan o cancelan esos turnos (CU-007C).
        if (cambios.rol) {
          const comprometidos = await m.count(Turno, {
            where: {
              empleadoId: id,
              estado: In(TURNO_VIGENTE),
              horaFin: MoreThan(new Date()),
              zonaEventoId: Not(IsNull()),
            },
          });
          if (comprometidos > 0) {
            throw new ConflictException({
              codigo: 'ROL_CON_ASIGNACIONES',
              mensaje: `No se puede cambiar el rol: tiene ${comprometidos} asignación(es) vigente(s) que exigen el rol actual. Reasígnalas o cancélalas primero.`,
            });
          }
        }

        await this.comprobarDuplicados(m, datos, id);
        Object.assign(empleado, datos);
        const guardado = await m.save(empleado);
        await auditar(m, { accion: 'EMPLEADO_ACTUALIZADO', realizadoPor, empleadoId: id, detalle: { cambios } });
        return guardado;
      }),
    );
  }

  /**
   * CU-007A (desactivar). Sus turnos futuros dejan de contar: se cancelan, y
   * las solicitudes de cambio pendientes sobre ellos se cierran. Si no, la
   * zona seguiría figurando cubierta por alguien que ya no está.
   */
  async desactivar(id: string, motivo: string, realizadoPor: string) {
    const { empleado, cancelados } = await this.empleados.manager.transaction(async (m) => {
      const empleado = await m.findOne(Empleado, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!empleado) throw new NotFoundException('Empleado no encontrado.');
      if (!empleado.activo) throw new ConflictException({ codigo: 'YA_INACTIVO', mensaje: 'El empleado ya está desactivado.' });

      const futuros = await m.find(Turno, {
        where: { empleadoId: id, estado: In(TURNO_VIGENTE), horaInicio: MoreThan(new Date()) },
        loadEagerRelations: false,
      });
      for (const turno of futuros) await this.cancelarEn(m, turno, `Empleado desactivado: ${motivo}`);

      empleado.activo = false;
      await m.save(empleado);
      await auditar(m, {
        accion: 'EMPLEADO_DESACTIVADO',
        realizadoPor,
        empleadoId: id,
        detalle: { motivo, turnosCancelados: futuros.map((t) => t.id) },
      });
      return { empleado, cancelados: futuros };
    });

    for (const turno of cancelados) {
      await this.notificar('ASIGNACION_CANCELADA', turno, `Se canceló tu turno en "${turno.zona}" porque tu ficha fue desactivada.`);
    }
    return { empleado, turnosCancelados: cancelados.length };
  }

  async reactivar(id: string, realizadoPor: string) {
    return this.empleados.manager.transaction(async (m) => {
      const empleado = await m.findOne(Empleado, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!empleado) throw new NotFoundException('Empleado no encontrado.');
      if (empleado.activo) throw new ConflictException({ codigo: 'YA_ACTIVO', mensaje: 'El empleado ya está activo.' });
      empleado.activo = true;
      const guardado = await m.save(empleado);
      await auditar(m, { accion: 'EMPLEADO_REACTIVADO', realizadoPor, empleadoId: id });
      return guardado;
    });
  }

  // --- Asignación (pasos 6-9 y CU-007C) -------------------------------------

  /**
   * Paso 7: los empleados activos con el rol que pide la zona y, para el
   * horario propuesto, si están libres y por qué no cuando no lo están. Usa
   * las mismas reglas que la asignación, así que lo que aquí sale disponible
   * es lo que la asignación va a aceptar. Al reasignar (CU-007C) se indica
   * el turno que se modifica, para que no choque consigo mismo.
   */
  async candidatos(zonaId: string, inicio?: string, fin?: string, excluirTurnoId?: string) {
    const zona = await this.zonas.findOneBy({ id: zonaId });
    if (!zona) throw new NotFoundException('Zona de evento no encontrada.');
    const horaInicio = new Date(inicio ?? '');
    const horaFin = new Date(fin ?? '');
    if (Number.isNaN(horaInicio.getTime()) || Number.isNaN(horaFin.getTime())) {
      throw new BadRequestException('Indica horaInicio y horaFin en formato ISO 8601.');
    }
    if (horaFin <= horaInicio) throw new BadRequestException('horaFin debe ser posterior a horaInicio.');

    const duracion = (horaFin.getTime() - horaInicio.getTime()) / 3_600_000;
    const activos = await this.empleados.find({ where: { rol: zona.rolRequerido, activo: true }, order: { nombre: 'ASC' } });
    const resultado = [];
    for (const empleado of activos) {
      const choque = await this.turnos.findOne({
        where: {
          empleadoId: empleado.id,
          estado: Not(EstadoTurno.CANCELADO),
          horaInicio: LessThan(horaFin),
          horaFin: MoreThan(horaInicio),
          ...(excluirTurnoId ? { id: Not(excluirTurnoId) } : {}),
        },
        loadEagerRelations: false,
      });
      const horasEseDia = await horasAsignadasEseDia(this.turnos, empleado.id, horaInicio, excluirTurnoId);
      let motivo: string | null = null;
      if (choque) motivo = `Ya tiene un turno en "${choque.zona}" que se cruza con ese horario.`;
      else if (duracion > MAX_HORAS_POR_TURNO) motivo = `El turno supera ${MAX_HORAS_POR_TURNO} h.`;
      else if (horasEseDia + duracion > MAX_HORAS_DIARIAS_EMPLEADO) {
        motivo = `Superaría ${MAX_HORAS_DIARIAS_EMPLEADO} h ese día (ya tiene ${horasEseDia.toFixed(1)} h).`;
      }
      resultado.push({ empleado, disponible: motivo === null, motivo, horasEseDia });
    }
    return resultado.sort((a, b) => Number(b.disponible) - Number(a.disponible));
  }

  /** Las asignaciones de un evento, con su empleado y su confirmación. */
  asignacionesDeEvento(eventoId: string) {
    if (!eventoId) throw new BadRequestException('Indica el eventoId.');
    return this.turnos.find({ where: { eventoId }, order: { horaInicio: 'ASC' } });
  }

  /** CU-007C: el organizador retira una asignación. */
  async cancelarAsignacion(turnoId: string, motivo: string, realizadoPor: string) {
    const turno = await this.turnos.manager.transaction(async (m) => {
      const turno = await m.findOne(Turno, { where: { id: turnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!turno) throw new NotFoundException('Turno no encontrado.');
      if (!TURNO_VIGENTE.includes(turno.estado)) {
        throw new ConflictException({ codigo: 'TURNO_NO_VIGENTE', mensaje: `La asignación ya no está vigente (estado: ${turno.estado}).` });
      }
      await this.cancelarEn(m, turno, motivo);
      await auditar(m, { accion: 'ASIGNACION_CANCELADA', realizadoPor, empleadoId: turno.empleadoId, turnoId, detalle: { motivo } });
      return turno;
    });
    await this.notificar('ASIGNACION_CANCELADA', turno, `Se canceló tu asignación en "${turno.zona}": ${motivo}`);
    return this.turnos.findOneBy({ id: turnoId });
  }

  // --- Respuesta del empleado (paso 13 y CU-007B) ---------------------------

  /**
   * Solo responde quien trabaja el turno: ni el jefe puede confirmar por él.
   * Rechazar libera el puesto (el turno queda cancelado y la zona vuelve a
   * contar el déficit) y avisa para que el organizador elija a otro.
   */
  async responder(turnoId: string, dto: ResponderAsignacionDto, quien: { empleadoId: string | null; usuarioId: string }) {
    const turno = await this.turnos.manager.transaction(async (m) => {
      const turno = await m.findOne(Turno, { where: { id: turnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!turno) throw new NotFoundException('Turno no encontrado.');
      if (!quien.empleadoId || turno.empleadoId !== quien.empleadoId) {
        throw new ForbiddenException({ codigo: 'TURNO_AJENO', mensaje: 'Solo puedes responder a tus propias asignaciones.' });
      }
      if (turno.estado !== EstadoTurno.ASIGNADO || turno.confirmacion !== ConfirmacionTurno.PENDIENTE) {
        throw new ConflictException({ codigo: 'SIN_RESPUESTA_PENDIENTE', mensaje: 'Esta asignación ya no espera respuesta.' });
      }
      if (turno.horaFin <= new Date()) {
        throw new ConflictException({ codigo: 'TURNO_TERMINADO', mensaje: 'El turno ya terminó.' });
      }

      turno.respondidoEn = new Date();
      if (dto.aceptar) {
        turno.confirmacion = ConfirmacionTurno.CONFIRMADA;
      } else {
        turno.confirmacion = ConfirmacionTurno.RECHAZADA;
        turno.motivoRechazo = dto.motivo!.trim();
        turno.estado = EstadoTurno.CANCELADO;
      }
      await m.save(turno);
      await auditar(m, {
        accion: dto.aceptar ? 'ASIGNACION_CONFIRMADA' : 'ASIGNACION_RECHAZADA',
        realizadoPor: quien.usuarioId,
        empleadoId: turno.empleadoId,
        turnoId,
        detalle: dto.aceptar ? {} : { motivo: turno.motivoRechazo },
      });
      return turno;
    });

    if (!dto.aceptar) {
      await this.notificar('ASIGNACION_RECHAZADA', turno, `El empleado rechazó la asignación en "${turno.zona}": ${turno.motivoRechazo}`);
    }
    return this.turnos.findOneBy({ id: turnoId });
  }

  // --- Apoyo ----------------------------------------------------------------

  private async buscar(id: string) {
    const empleado = await this.empleados.findOneBy({ id });
    if (!empleado) throw new NotFoundException('Empleado no encontrado.');
    return empleado;
  }

  /** Paso 4: un mensaje por campo repetido, antes de intentar guardar. */
  private async comprobarDuplicados(m: EntityManager, datos: DatosFicha, excluirId?: string) {
    for (const [campo, mensaje] of UNICOS) {
      const valor = datos[campo];
      if (valor === undefined || valor === null) continue;
      const otro = await m.findOne(Empleado, {
        where: { [campo]: valor, ...(excluirId ? { id: Not(excluirId) } : {}) },
        loadEagerRelations: false,
      });
      if (otro) {
        throw new ConflictException({
          codigo: 'EMPLEADO_DUPLICADO',
          campo,
          mensaje: campo === 'usuarioId' ? mensaje : `${mensaje} "${valor}".`,
        });
      }
    }
  }

  /**
   * Dos altas simultáneas pueden pasar ambas la comprobación previa: la
   * restricción UNIQUE de la base es la que decide, y aquí se traduce.
   */
  private async conUnicidad<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      const codigo = (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code;
      if (error instanceof QueryFailedError && codigo === '23505') {
        throw new ConflictException({
          codigo: 'EMPLEADO_DUPLICADO',
          mensaje: 'Otro empleado ya usa alguno de estos datos (cuenta, credencial, documento o correo).',
        });
      }
      throw error;
    }
  }

  private async cancelarEn(m: EntityManager, turno: Turno, motivo: string) {
    turno.estado = EstadoTurno.CANCELADO;
    await m.update(Turno, { id: turno.id }, { estado: EstadoTurno.CANCELADO });
    await m.update(
      SolicitudCambioTurno,
      { turnoId: turno.id, estado: EstadoSolicitudCambio.PENDIENTE },
      { estado: EstadoSolicitudCambio.RECHAZADA, motivoRechazoOBloqueo: motivo, fechaRevision: new Date() },
    );
  }

  /** Paso 12: el aviso viaja por la misma cola de CU-017/018, fuera de la transacción. */
  private notificar(tipo: CambioTurnoEvento['tipo'], turno: Turno, mensaje: string) {
    return this.eventosPublicador.publicarCambioTurno({ tipo, turnoId: turno.id, empleadoNuevoId: turno.empleadoId, mensaje });
  }
}

/** Recorta espacios, pasa el correo a minúsculas y quita lo vacío. */
function normalizar<T extends Partial<CrearEmpleadoDto>>(dto: T): T {
  const limpio: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(dto)) {
    if (valor === undefined) continue;
    const texto = typeof valor === 'string' ? valor.trim() : valor;
    limpio[campo] = campo === 'correo' && typeof texto === 'string' ? texto.toLowerCase() : texto;
  }
  return limpio as T;
}
