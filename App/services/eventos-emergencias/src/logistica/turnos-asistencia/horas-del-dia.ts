import { Repository } from 'typeorm';
import { Turno } from './entities/turno.entity.js';
import { EstadoTurno } from './enums/estados.js';

/**
 * Cuántas horas tiene ya asignadas un empleado el día de un turno.
 *
 * ## Por qué existe esto
 *
 * El límite `MAX_HORAS_DIARIAS_EMPLEADO` es, como dice su nombre, **diario**:
 * nadie debe trabajar más de esas horas en una jornada. Pero se comprobaba
 * contra `empleado.horasTrabajadasTotales`, que es un acumulado **de por
 * vida** — crece en cada salida registrada y nunca se reinicia.
 *
 * El efecto era que, tras un par de turnos completos, ese empleado superaba el
 * tope para siempre y **no se le podía asignar nunca más**, ni en CU-017 ni
 * aprobándole un cambio de turno en CU-018. No fallaba de golpe: iba dejando
 * gente fuera a medida que trabajaba, que es la peor forma de fallar.
 *
 * `horasTrabajadasTotales` sigue existiendo y sigue siendo útil —es la
 * estadística que ve el jefe de personal—, pero no es lo que hay que mirar
 * para decidir si alguien cabe en un turno más.
 *
 * ## Qué cuenta como "el día"
 *
 * Los turnos se cuentan por el día en que **empiezan**, en hora local del
 * servidor. Un turno nocturno que cruza la medianoche pesa sobre el día en que
 * arrancó, que es como lo cuenta quien arma la planilla.
 */

/** Principio y fin del día natural al que pertenece `momento`. */
export function limitesDelDia(momento: Date): { desde: Date; hasta: Date } {
  const desde = new Date(momento);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + 1);
  return { desde, hasta };
}

/**
 * Suma las horas de los turnos vigentes de ese empleado que empiezan el mismo
 * día que `momento`.
 *
 * Los turnos cancelados no cuentan. `excluirTurnoId` deja fuera un turno
 * concreto: al reasignar o al aprobar un cambio, el turno que se está tocando
 * no debe contarse dos veces.
 */
export async function horasAsignadasEseDia(
  turnos: Repository<Turno>,
  empleadoId: string,
  momento: Date,
  excluirTurnoId?: string,
): Promise<number> {
  const { desde, hasta } = limitesDelDia(momento);

  const consulta = turnos
    .createQueryBuilder('turno')
    .where('turno.empleadoId = :empleadoId', { empleadoId })
    .andWhere('turno.estado != :cancelado', { cancelado: EstadoTurno.CANCELADO })
    .andWhere('turno.horaInicio >= :desde', { desde })
    .andWhere('turno.horaInicio < :hasta', { hasta });

  if (excluirTurnoId) {
    consulta.andWhere('turno.id != :excluirTurnoId', { excluirTurnoId });
  }

  const delDia = await consulta.getMany();
  return delDia.reduce(
    (total, t) => total + (t.horaFin.getTime() - t.horaInicio.getTime()) / 3_600_000,
    0,
  );
}
