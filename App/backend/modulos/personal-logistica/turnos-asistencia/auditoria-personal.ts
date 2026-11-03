import type { EntityManager } from 'typeorm';
import { AuditoriaPersonal } from './entities/auditoria-personal.entity';

/** Acciones que registra la auditoría de personal (CU-007). */
export type AccionPersonal =
  | 'EMPLEADO_CREADO'
  | 'EMPLEADO_ACTUALIZADO'
  | 'EMPLEADO_DESACTIVADO'
  | 'EMPLEADO_REACTIVADO'
  | 'PERSONAL_ASIGNADO'
  | 'ASIGNACION_MODIFICADA'
  | 'ASIGNACION_CANCELADA'
  | 'ASIGNACION_CONFIRMADA'
  | 'ASIGNACION_RECHAZADA';

/**
 * Escribe una entrada con el mismo `manager` de la operación auditada: si la
 * operación se revierte, su rastro también. Una auditoría que dice que algo
 * pasó cuando no pasó es peor que ninguna.
 */
export function auditar(
  manager: EntityManager,
  entrada: {
    accion: AccionPersonal;
    realizadoPor: string;
    empleadoId?: string | null;
    turnoId?: string | null;
    detalle?: Record<string, unknown>;
  },
) {
  return manager.save(
    manager.create(AuditoriaPersonal, {
      accion: entrada.accion,
      realizadoPor: entrada.realizadoPor,
      empleadoId: entrada.empleadoId ?? null,
      turnoId: entrada.turnoId ?? null,
      detalle: entrada.detalle ?? {},
    }),
  );
}
