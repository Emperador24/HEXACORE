import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Not, Repository } from 'typeorm';
import { AsignarPersonalDto } from './dto/asignar-personal.dto.js';
import { CrearZonaEventoDto } from './dto/crear-zona-evento.dto.js';
import { Empleado } from './entities/empleado.entity.js';
import { Turno } from './entities/turno.entity.js';
import { ZonaEvento } from './entities/zona-evento.entity.js';
import { EstadoTurno } from './enums/estados.js';
import { EventosPublicadorService } from './eventos-publicador.service.js';
import { horasAsignadasEseDia } from './horas-del-dia.js';
import {
  MAX_HORAS_DIARIAS_EMPLEADO,
  MAX_HORAS_POR_TURNO,
} from './turnos-asistencia.constants.js';

/**
 * CU-017 (Asignar personal operativo): el coordinador logístico distribuye
 * el personal disponible en las zonas de un evento, con verificación de
 * disponibilidad, rol y límite de horas, y cálculo de cobertura por zona.
 */
@Injectable()
export class PersonalOperativoService {
  constructor(
    @InjectRepository(Empleado)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(ZonaEvento)
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
  ): Promise<boolean> {
    if (!horaInicio || !horaFin) {
      // Sin ventana horaria (listado general), solo importa que exista.
      return true;
    }
    const choque = await this.turnos.findOne({
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
  async asignarPersonal(zonaId: string, dto: AsignarPersonalDto, excluirTurnoId?: string) {
    const zona = await this.zonas.findOneBy({ id: zonaId });
    if (!zona) {
      throw new NotFoundException('Zona de evento no encontrada.');
    }
    const empleado = await this.empleados.findOneBy({ id: dto.empleadoId });
    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado.');
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

    // Paso 4 + CU-017A: ¿tiene un choque de horario con otro turno?
    const disponible = await this.estaDisponible(empleado.id, horaInicio, horaFin, excluirTurnoId);
    if (!disponible) {
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
    const duracionHoras = (horaFin.getTime() - horaInicio.getTime()) / 3_600_000;
    const yaAsignadas = await horasAsignadasEseDia(
      this.turnos,
      empleado.id,
      horaInicio,
      excluirTurnoId,
    );
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
    if (excluirTurnoId) {
      // CU-017E: reasignación de último momento sobre un turno existente.
      turno = (await this.turnos.findOneBy({ id: excluirTurnoId }))!;
      turno.empleado = empleado;
      turno.empleadoId = empleado.id;
      turno.horaInicio = horaInicio;
      turno.horaFin = horaFin;
    } else {
      turno = this.turnos.create({
        empleadoId: empleado.id,
        eventoId: zona.eventoId,
        zona: zona.nombre,
        zonaEventoId: zona.id,
        horaInicio,
        horaFin,
        estado: EstadoTurno.ASIGNADO,
      });
    }
    const guardado = await this.turnos.save(turno);

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
  async reasignar(turnoId: string, dto: AsignarPersonalDto) {
    const turno = await this.turnos.findOneBy({ id: turnoId });
    if (!turno) {
      throw new NotFoundException('Turno no encontrado.');
    }
    if (!turno.zonaEventoId) {
      throw new BadRequestException(
        'Este turno no fue creado por asignación de personal operativo (CU-017).',
      );
    }
    return this.asignarPersonal(turno.zonaEventoId, dto, turnoId);
  }
}
