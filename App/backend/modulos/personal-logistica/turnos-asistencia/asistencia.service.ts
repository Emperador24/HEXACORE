import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto';
import { Empleado } from './entities/empleado.entity';
import { RegistroAsistencia } from './entities/registro-asistencia.entity';
import { Turno } from './entities/turno.entity';
import { EstadoTurno, Puntualidad, TipoRegistroAsistencia } from './enums/estados';
import {
  ENTRADA_ANTICIPADA_MAX,
  SALIDA_POSTERIOR_MAX,
  TOLERANCIA_PUNTUALIDAD,
} from './turnos-asistencia.constants';

/** CU-009, post-condición 2: el estado del empleado tras el registro. */
export type EstadoEmpleado = 'EN_TURNO' | 'FUERA_DE_TURNO';

const MINUTO = 60_000;

@Injectable()
export class AsistenciaService {
  constructor(
    @InjectRepository(Empleado, CONEXION_LOGISTICA)
    private readonly empleados: Repository<Empleado>,
    @InjectRepository(Turno, CONEXION_LOGISTICA)
    private readonly turnos: Repository<Turno>,
    @InjectRepository(RegistroAsistencia, CONEXION_LOGISTICA)
    private readonly registros: Repository<RegistroAsistencia>,
  ) {}

  /**
   * CU-009, pasos 1-5 (y CU-018 D/E/F): valida la credencial, que el
   * empleado tenga un turno de ese evento y que no tenga ya una entrada
   * abierta. CU-009A/B: la entrada se acepta desde `ENTRADA_ANTICIPADA_MAX`
   * minutos antes del inicio y se clasifica como anticipada, a tiempo o
   * tardía. Llegar antes o tarde no es una anomalía: queda anotado para el
   * reporte del supervisor.
   *
   * Offline-first: si el dispositivo de control registró el evento sin
   * conexión, envía `clientTimestamp` (hora real del evento) e
   * `idempotencyKey` (para poder reintentar la sincronización sin
   * duplicar el registro cuando recupere señal).
   */
  async registrarEntrada(dto: RegistrarAsistenciaDto) {
    const repetido = await this.buscarPorIdempotencyKey(dto.idempotencyKey);
    if (repetido) {
      return this.conEstado(repetido);
    }

    const empleado = await this.buscarEmpleadoPorCredencial(dto.credencial);
    const momento = dto.clientTimestamp ? new Date(dto.clientTimestamp) : new Date();

    // CU-018E: el empleado no está asignado al evento (sin turno *al momento
    // real del registro*, no al de la sincronización). Si el punto de
    // control indica `eventoId`, el turno debe ser justo el de ESE evento —
    // así dos eventos simultáneos no se cruzan.
    const turnoVigente = await this.turnoParaEntrada(empleado.id, momento, dto.eventoId);
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

    // CU-009A/B: respecto a la hora de inicio del turno.
    const desviacion = Math.round((momento.getTime() - turnoVigente.horaInicio.getTime()) / MINUTO);
    return this.guardarRegistro(dto, {
      empleadoId: empleado.id,
      turnoId: turnoVigente.id,
      tipo: TipoRegistroAsistencia.ENTRADA,
      timestamp: momento,
      anomalia: esDuplicado,
      motivoAnomalia: esDuplicado
        ? 'Registro de entrada duplicado sin salida previa.'
        : null,
      puntualidad: esDuplicado ? null : clasificar(desviacion, Puntualidad.TARDIA),
      minutosDesviacion: esDuplicado ? null : desviacion,
    });
  }

  /**
   * CU-009, pasos 7-10: registra la salida y calcula las horas trabajadas
   * sobre el momento real del evento (offline-first, ver registrarEntrada).
   * CU-009C: la salida se clasifica como anticipada, a tiempo o posterior
   * al fin del turno; se acepta hasta `SALIDA_POSTERIOR_MAX` minutos después.
   */
  async registrarSalida(dto: RegistrarAsistenciaDto) {
    const repetido = await this.buscarPorIdempotencyKey(dto.idempotencyKey);
    if (repetido) {
      return this.conEstado(repetido);
    }

    const empleado = await this.buscarEmpleadoPorCredencial(dto.credencial);
    const momento = dto.clientTimestamp ? new Date(dto.clientTimestamp) : new Date();

    // Si el punto de control indica `eventoId`, la salida solo puede
    // cerrar una entrada del turno de ESE evento — igual que en
    // registrarEntrada. Sin esto, un empleado con turnos simultáneos en
    // dos eventos podía marcar salida en uno y cerrar por error la
    // entrada del otro (siempre tomaba "la última entrada", sin más).
    let turnoId: string | undefined;
    if (dto.eventoId) {
      const turnoVigente = await this.turnos.findOne({
        where: {
          empleadoId: empleado.id,
          eventoId: dto.eventoId,
          estado: Not(EstadoTurno.CANCELADO),
          horaInicio: LessThanOrEqual(new Date(momento.getTime() + ENTRADA_ANTICIPADA_MAX * MINUTO)),
          horaFin: MoreThanOrEqual(new Date(momento.getTime() - SALIDA_POSTERIOR_MAX * MINUTO)),
        },
        order: { horaInicio: 'DESC' },
        loadEagerRelations: false,
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
    if (momento < entradaAbierta.timestamp) {
      throw new BadRequestException('La hora de salida es anterior a la de entrada.');
    }

    const horasCalculadas =
      (momento.getTime() - entradaAbierta.timestamp.getTime()) / 3_600_000;

    empleado.horasTrabajadasTotales += horasCalculadas;
    await this.empleados.save(empleado);

    // CU-009C: respecto a la hora de fin del turno.
    const turno = entradaAbierta.turnoId
      ? await this.turnos.findOne({ where: { id: entradaAbierta.turnoId }, loadEagerRelations: false })
      : null;
    const desviacion = turno ? Math.round((momento.getTime() - turno.horaFin.getTime()) / MINUTO) : null;

    return this.guardarRegistro(dto, {
      empleadoId: empleado.id,
      turnoId: entradaAbierta.turnoId,
      tipo: TipoRegistroAsistencia.SALIDA,
      timestamp: momento,
      horasCalculadas,
      puntualidad: desviacion === null ? null : clasificar(desviacion, Puntualidad.POSTERIOR),
      minutosDesviacion: desviacion,
    });
  }

  listarRegistros() {
    return this.registros.find({ order: { timestamp: 'DESC' } });
  }

  /** Los fichajes de un empleado. Sin empleado, ninguno — nunca todos. */
  registrosDeEmpleado(empleadoId: string | null) {
    if (!empleadoId) return Promise.resolve([]);
    return this.registros.find({
      where: { empleadoId },
      order: { timestamp: 'DESC' },
    });
  }

  /** CU-009, post-condición 2: "En turno" si tiene una entrada sin cerrar. */
  async estadoDe(empleadoId: string): Promise<EstadoEmpleado> {
    return (await this.buscarEntradaAbierta(empleadoId)) ? 'EN_TURNO' : 'FUERA_DE_TURNO';
  }

  /**
   * CU-009, pasos 12-13: el reporte de horas trabajadas para el supervisor.
   * Una fila por empleado con turnos en ese evento (o en el rango de fechas):
   * horas, entradas tardías y anticipadas, salidas anticipadas y posteriores,
   * anomalías y su estado actual.
   */
  async reporte(filtro: { eventoId?: string; desde?: string; hasta?: string }) {
    const desde = filtro.desde ? new Date(filtro.desde) : null;
    const hasta = filtro.hasta ? new Date(filtro.hasta) : null;
    if ((desde && Number.isNaN(desde.getTime())) || (hasta && Number.isNaN(hasta.getTime()))) {
      throw new BadRequestException('desde y hasta deben ir en formato ISO 8601.');
    }
    if (!filtro.eventoId && !desde) {
      throw new BadRequestException('Indica el eventoId o el rango de fechas (desde, hasta).');
    }

    const condiciones: string[] = [`t."estado" <> 'CANCELADO'`];
    const parametros: unknown[] = [];
    if (filtro.eventoId) { parametros.push(filtro.eventoId); condiciones.push(`t."eventoId" = $${parametros.length}`); }
    if (desde) { parametros.push(desde); condiciones.push(`t."horaFin" >= $${parametros.length}`); }
    if (hasta) { parametros.push(hasta); condiciones.push(`t."horaInicio" < $${parametros.length}`); }

    const filas: {
      empleadoId: string; nombre: string; rol: string; turnos: number; horasProgramadas: number;
      horasTrabajadas: number; entradas: number; tardias: number; anticipadas: number;
      salidasAnticipadas: number; salidasPosteriores: number; anomalias: number; abiertas: number;
    }[] = await this.registros.query(
      `WITH turnos_filtrados AS (
         SELECT t.* FROM turnos t WHERE ${condiciones.join(' AND ')}
       )
       SELECT e."id" AS "empleadoId", e."nombre", e."rol",
              count(DISTINCT tf."id")::int AS "turnos",
              coalesce((SELECT sum(extract(epoch FROM (x."horaFin" - x."horaInicio")) / 3600)
                          FROM turnos_filtrados x WHERE x."empleadoId"::text = e."id"::text), 0)::float AS "horasProgramadas",
              coalesce(sum(r."horasCalculadas") FILTER (WHERE r."tipo" = 'SALIDA'), 0)::float AS "horasTrabajadas",
              count(r."id") FILTER (WHERE r."tipo" = 'ENTRADA' AND NOT r."anomalia")::int AS "entradas",
              count(r."id") FILTER (WHERE r."tipo" = 'ENTRADA' AND r."puntualidad" = 'TARDIA')::int AS "tardias",
              count(r."id") FILTER (WHERE r."tipo" = 'ENTRADA' AND r."puntualidad" = 'ANTICIPADA')::int AS "anticipadas",
              count(r."id") FILTER (WHERE r."tipo" = 'SALIDA' AND r."puntualidad" = 'ANTICIPADA')::int AS "salidasAnticipadas",
              count(r."id") FILTER (WHERE r."tipo" = 'SALIDA' AND r."puntualidad" = 'POSTERIOR')::int AS "salidasPosteriores",
              count(r."id") FILTER (WHERE r."anomalia")::int AS "anomalias",
              (count(r."id") FILTER (WHERE r."tipo" = 'ENTRADA' AND NOT r."anomalia")
                - count(r."id") FILTER (WHERE r."tipo" = 'SALIDA' AND NOT r."anomalia"))::int AS "abiertas"
         FROM turnos_filtrados tf
         JOIN empleados e ON e."id"::text = tf."empleadoId"::text
         LEFT JOIN registros_asistencia r ON r."turnoId"::text = tf."id"::text
        GROUP BY e."id", e."nombre", e."rol"
        ORDER BY e."nombre"`,
      parametros,
    );

    const empleados = filas.map((f) => ({
      ...f,
      horasProgramadas: redondear(f.horasProgramadas),
      horasTrabajadas: redondear(f.horasTrabajadas),
      estado: (f.abiertas > 0 ? 'EN_TURNO' : 'FUERA_DE_TURNO') as EstadoEmpleado,
    }));
    return {
      filtro: { eventoId: filtro.eventoId ?? null, desde, hasta },
      totales: {
        empleados: empleados.length,
        enTurno: empleados.filter((e) => e.estado === 'EN_TURNO').length,
        horasProgramadas: redondear(empleados.reduce((n, e) => n + e.horasProgramadas, 0)),
        horasTrabajadas: redondear(empleados.reduce((n, e) => n + e.horasTrabajadas, 0)),
        tardias: empleados.reduce((n, e) => n + e.tardias, 0),
        anomalias: empleados.reduce((n, e) => n + e.anomalias, 0),
      },
      empleados,
    };
  }

  /**
   * El turno contra el que se registra una entrada: no cancelado, que no
   * haya terminado y que empiece a más tardar `ENTRADA_ANTICIPADA_MAX`
   * minutos después de ahora (CU-009A). Si hay varios, el más próximo.
   */
  private turnoParaEntrada(empleadoId: string, momento: Date, eventoId?: string) {
    return this.turnos.findOne({
      where: {
        empleadoId,
        ...(eventoId ? { eventoId } : {}),
        estado: Not(EstadoTurno.CANCELADO),
        horaInicio: LessThanOrEqual(new Date(momento.getTime() + ENTRADA_ANTICIPADA_MAX * MINUTO)),
        horaFin: MoreThanOrEqual(momento),
      },
      order: { horaInicio: 'ASC' },
      loadEagerRelations: false,
    });
  }

  /**
   * Última ENTRADA del empleado (opcionalmente acotada a un turno/evento
   * específico) que todavía no tiene una SALIDA posterior. Sin esto, una
   * salida siempre cerraba "la última entrada que sea", sin comprobar si
   * ya estaba cerrada ni de qué turno era — lo que permitía que una
   * salida de un evento cerrara por error la entrada abierta de otro, o
   * que una segunda salida accidental volviera a contar las mismas horas.
   *
   * Las entradas marcadas como anomalía no abren turno: no corresponden a
   * ninguno o duplican otra.
   */
  private async buscarEntradaAbierta(empleadoId: string, turnoId?: string) {
    const entradas = await this.registros.find({
      where: {
        empleadoId,
        tipo: TipoRegistroAsistencia.ENTRADA,
        anomalia: false,
        ...(turnoId ? { turnoId } : {}),
      },
      order: { timestamp: 'DESC' },
      loadEagerRelations: false,
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
            loadEagerRelations: false,
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

  private async guardarRegistro(
    dto: RegistrarAsistenciaDto,
    datos: Partial<RegistroAsistencia> & { timestamp: Date },
  ) {
    const registro = this.registros.create({
      credencialUsada: dto.credencial,
      idempotencyKey: dto.idempotencyKey ?? null,
      sincronizadoEn: new Date(),
      ...datos,
    });
    return this.conEstado(await this.registros.save(registro));
  }

  /** Pasos 5 y 10: el registro, con el estado en que queda el empleado. */
  private async conEstado(registro: RegistroAsistencia) {
    return Object.assign(registro, { estadoEmpleado: await this.estadoDe(registro.empleadoId) });
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

/** Antes de la tolerancia: anticipada; después: `tarde` (tardía o posterior). */
function clasificar(minutos: number, tarde: Puntualidad.TARDIA | Puntualidad.POSTERIOR): Puntualidad {
  if (minutos < -TOLERANCIA_PUNTUALIDAD) return Puntualidad.ANTICIPADA;
  if (minutos > TOLERANCIA_PUNTUALIDAD) return tarde;
  return Puntualidad.A_TIEMPO;
}

function redondear(horas: number) {
  return Math.round(horas * 100) / 100;
}
