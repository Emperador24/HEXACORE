import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Not, Repository } from 'typeorm';
import { AsignarPersonalDto } from './dto/asignar-personal.dto';
import { CrearZonaEventoDto } from './dto/crear-zona-evento.dto';
import { Empleado } from './entities/empleado.entity';
import { Turno } from './entities/turno.entity';
import { ZonaEvento } from './entities/zona-evento.entity';
import { auditar } from './auditoria-personal';
import { ConfirmacionTurno, EstadoTurno } from './enums/estados';
import { EventosPublicadorService } from './eventos-publicador.service';
import { horasAsignadasEseDia } from './horas-del-dia';
import {
  MAX_HORAS_DIARIAS_EMPLEADO,
  MAX_HORAS_POR_TURNO,
} from './turnos-asistencia.constants';

/**
 * CU-017 (Asignar personal operativo): el coordinador logístico distribuye
 * el personal disponible en las zonas de un evento, con verificación de
 * disponibilidad, rol y límite de horas, y cálculo de cobertura por zona.
 */
@Injectable()
export class PersonalOperativoService {
  constructor(
    @InjectRepository(Empleado, CONEXION_LOGISTICA)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno, CONEXION_LOGISTICA)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(ZonaEvento, CONEXION_LOGISTICA)
    private readonly zonas: Repository<ZonaEvento>,
    private readonly eventosPublicador: EventosPublicadorService,
  ) {}

  crearZona(dto: CrearZonaEventoDto) {
    return this.zonas.save(this.zonas.create(dto));
  }

  /** Paso 2 + paso 6: zonas del evento con su cobertura actual y déficit. */
  async listarZonas(eventoId: string) {
    const zonas = await this.zonas.find({ where: { eventoId } });
    return Promise.all(zonas.map((zona) => this.conCobertura(zona)));
  }

  private async conCobertura(zona: ZonaEvento) {
    const personalAsignado = await this.turnos.count({
      where: { zonaEventoId: zona.id, estado: Not(EstadoTurno.CANCELADO) },
    });
    return {
      ...zona,
      personalAsignado,
      deficit: personalAsignado < zona.personalRequerido,
    };
  }

  /**
   * Paso 2 (personal disponible por rol) y CU-017A (sugerencia de
   * reemplazo): empleados activos de ese rol sin un turno que se solape
   * con el horario pedido.
   */
  async personalDisponible(eventoId: string, rol?: string) {
    void eventoId; // reservado: hoy la disponibilidad es global, no por evento.
    const candidatos = await this.empleados.find({
      where: rol ? { rol, activo: true } : { activo: true },
    });
    const disponibles: Empleado[] = [];
    for (const candidato of candidatos) {
      if (await this.estaDisponible(candidato.id)) {
        disponibles.push(candidato);
      }
    }
    return disponibles;
  }

  private async estaDisponible(
    empleadoId: string,
    horaInicio?: Date,
    horaFin?: Date,
    excluirTurnoId?: string,
    turnos: Repository<Turno> = this.turnos,
  ): Promise<boolean> {
    if (!horaInicio || !horaFin) {
      // Sin ventana horaria (listado general), solo importa que exista.
      return true;
    }
    const choque = await turnos.findOne({
      where: {
        empleadoId,
        estado: Not(EstadoTurno.CANCELADO),
        horaInicio: LessThan(horaFin),
        horaFin: MoreThan(horaInicio),
        ...(excluirTurnoId ? { id: Not(excluirTurnoId) } : {}),
      },
    });
    return !choque;
  }

  private async buscarDisponible(
    rol: string,
    horaInicio: Date,
    horaFin: Date,
    excluirEmpleadoId?: string,
  ): Promise<Empleado | null> {
    const candidatos = await this.empleados.find({
      where: {
        rol,
        activo: true,
        ...(excluirEmpleadoId ? { id: Not(excluirEmpleadoId) } : {}),
      },
    });
    for (const candidato of candidatos) {
      if (await this.estaDisponible(candidato.id, horaInicio, horaFin)) {
        return candidato;
      }
    }
    return null;
  }

  /**
   * Pasos 3-9: valida rol (paso 5), disponibilidad de horario (paso 4,
   * CU-017A si falla) y límite de horas (CU-017C), crea el turno, recalcula
   * la cobertura de la zona (paso 6, CU-017B/D si sigue en déficit) y
   * notifica al empleado asignado (paso 9).
   */
  async asignarPersonal(
    zonaId: string,
    dto: AsignarPersonalDto,
    realizadoPor: string,
    excluirTurnoId?: string,
  ) {
    const zona = await this.zonas.findOneBy({ id: zonaId });
    if (!zona) {
      throw new NotFoundException('Zona de evento no encontrada.');
    }
    const empleado = await this.empleados.findOneBy({ id: dto.empleadoId });
    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado.');
    }
    // CU-007, precondición 2: solo se asigna a quien está activo.
    if (!empleado.activo) {
      throw new BadRequestException(`${empleado.nombre} está desactivado y no puede recibir asignaciones.`);
    }

    const horaInicio = new Date(dto.horaInicio);
    const horaFin = new Date(dto.horaFin);
    if (horaFin <= horaInicio) {
      throw new BadRequestException('horaFin debe ser posterior a horaInicio.');
    }

    // Paso 5: el empleado debe tener el rol que la zona requiere.
    if (empleado.rol !== zona.rolRequerido) {
      throw new BadRequestException(
        `El empleado tiene el rol "${empleado.rol}", pero la zona "${zona.nombre}" requiere "${zona.rolRequerido}".`,
      );
    }

    const duracionHoras = (horaFin.getTime() - horaInicio.getTime()) / 3_600_000;
    let anterior: { empleadoId: string; horaInicio: Date; horaFin: Date } | null = null;
    const guardado = await this.turnos.manager.transaction(async (m) => {
      // Validar y guardar van en la misma transacción y con el empleado
      // bloqueado: si no, dos asignaciones simultáneas al mismo empleado
      // pasaban las dos la comprobación de choque y lo dejaban con dos turnos
      // cruzados. El turno que se reasigna se bloquea antes que el empleado,
      // en el mismo orden que la aprobación de un cambio (CU-008), para que
      // las dos no se esperen mutuamente.
      const turnosTx = m.getRepository(Turno);
      const existente = excluirTurnoId
        ? await turnosTx.findOne({ where: { id: excluirTurnoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false })
        : null;
      if (excluirTurnoId && !existente) throw new NotFoundException('Turno no encontrado.');
      await m.findOne(Empleado, { where: { id: empleado.id }, lock: { mode: 'pessimistic_write' } });

      // Paso 4 + CU-017A: ¿tiene un choque de horario con otro turno?
      if (!(await this.estaDisponible(empleado.id, horaInicio, horaFin, excluirTurnoId, turnosTx))) {
        const sugerencia = await this.buscarDisponible(zona.rolRequerido, horaInicio, horaFin, empleado.id);
        throw new ConflictException({
          message: `${empleado.nombre} ya tiene un turno que se solapa con ese horario.`,
          sugerencia,
        });
      }

      // CU-017C: límite de horas por turno y diarias del empleado.
      //
      // Lo diario se mide contra los turnos que ya tiene **ese día**, no contra
      // `horasTrabajadasTotales`, que es el acumulado de toda su vida laboral:
      // usándolo, cualquiera que hubiera trabajado un par de turnos quedaba
      // inasignable para siempre. Ver `horas-del-dia.ts`.
      const yaAsignadas = await horasAsignadasEseDia(turnosTx, empleado.id, horaInicio, excluirTurnoId);
      if (
        duracionHoras > MAX_HORAS_POR_TURNO ||
        yaAsignadas + duracionHoras > MAX_HORAS_DIARIAS_EMPLEADO
      ) {
        throw new BadRequestException(
          `${empleado.nombre} superaría el límite de horas: ya tiene ${yaAsignadas.toFixed(1)} h ` +
            `asignadas ese día y este turno suma ${duracionHoras.toFixed(1)} h ` +
            `(máximo ${MAX_HORAS_DIARIAS_EMPLEADO} h diarias, ${MAX_HORAS_POR_TURNO} h por turno). ` +
            'Selecciona otro empleado.',
        );
      }

      let turno: Turno;
      if (existente) {
        // CU-017E / CU-007C: reasignación sobre un turno existente.
        turno = existente;
        anterior = { empleadoId: turno.empleadoId, horaInicio: turno.horaInicio, horaFin: turno.horaFin };
        turno.empleado = empleado;
        turno.empleadoId = empleado.id;
        turno.horaInicio = horaInicio;
        turno.horaFin = horaFin;
        // Otra persona u otro horario es otra propuesta: vuelve a esperar
        // respuesta. Y si el anterior la había rechazado, el puesto se reabre.
        turno.confirmacion = ConfirmacionTurno.PENDIENTE;
        turno.motivoRechazo = null;
        turno.respondidoEn = null;
        if (turno.estado === EstadoTurno.CANCELADO) turno.estado = EstadoTurno.ASIGNADO;
      } else {
        turno = turnosTx.create({
          empleadoId: empleado.id,
          eventoId: zona.eventoId,
          zona: zona.nombre,
          zonaEventoId: zona.id,
          horaInicio,
          horaFin,
          estado: EstadoTurno.ASIGNADO,
        });
      }
      const guardado = await m.save(turno);
      await auditar(m, {
        accion: anterior ? 'ASIGNACION_MODIFICADA' : 'PERSONAL_ASIGNADO',
        realizadoPor,
        empleadoId: empleado.id,
        turnoId: guardado.id,
        detalle: {
          zona: zona.nombre,
          eventoId: zona.eventoId,
          horaInicio: horaInicio.toISOString(),
          horaFin: horaFin.toISOString(),
          ...(anterior ? { anterior } : {}),
        },
      });
      return guardado;
    });

    // Paso 9: notifica al empleado asignado (misma cola/DLQ de CU-018).
    await this.eventosPublicador.publicarCambioTurno({
      tipo: 'PERSONAL_ASIGNADO',
      turnoId: guardado.id,
      empleadoNuevoId: empleado.id,
      mensaje: `Se te asignó la zona "${zona.nombre}" del evento ${zona.eventoId}.`,
    });

    // Paso 6 + CU-017B/D: cobertura de la zona tras esta asignación.
    const cobertura = await this.conCobertura(zona);

    return { turno: guardado, cobertura };
  }

  /** CU-017E: cambio de último momento sobre un turno ya asignado. */
  async reasignar(turnoId: string, dto: AsignarPersonalDto, realizadoPor: string) {
    const turno = await this.turnos.findOneBy({ id: turnoId });
    if (!turno) {
      throw new NotFoundException('Turno no encontrado.');
    }
    if (!turno.zonaEventoId) {
      throw new BadRequestException(
        'Este turno no fue creado por asignación de personal operativo (CU-017).',
      );
    }
    return this.asignarPersonal(turno.zonaEventoId, dto, realizadoPor, turnoId);
  }
}
