import { ConfirmacionTurno, EstadoTurno, Turno } from '../core/models';

export type Tono = 'ok' | 'aviso' | 'peligro' | 'neutro';

/** Cómo se lee el estado de una asignación: combina el ciclo del turno y la respuesta del empleado. */
export function estadoAsignacion(turno: Turno): { texto: string; tono: Tono } {
  if (turno.confirmacion === ConfirmacionTurno.RECHAZADA) return { texto: 'Rechazada', tono: 'peligro' };
  if (turno.estado === EstadoTurno.CANCELADO) return { texto: 'Cancelada', tono: 'neutro' };
  if (turno.estado === EstadoTurno.CAMBIADO) return { texto: 'Cambiada (CU-018)', tono: 'neutro' };
  if (turno.estado === EstadoTurno.CAMBIO_SOLICITADO) return { texto: 'Cambio solicitado', tono: 'aviso' };
  if (turno.confirmacion === ConfirmacionTurno.CONFIRMADA) return { texto: 'Confirmada', tono: 'ok' };
  return { texto: 'Esperando respuesta', tono: 'aviso' };
}

/** Una asignación que todavía compromete al empleado y se puede tocar. */
export function asignacionVigente(turno: Turno): boolean {
  return turno.estado === EstadoTurno.ASIGNADO || turno.estado === EstadoTurno.CAMBIO_SOLICITADO;
}

const ACCIONES: Record<string, string> = {
  EMPLEADO_CREADO: 'Alta de la ficha',
  EMPLEADO_ACTUALIZADO: 'Ficha actualizada',
  EMPLEADO_DESACTIVADO: 'Desactivado',
  EMPLEADO_REACTIVADO: 'Reactivado',
  PERSONAL_ASIGNADO: 'Asignado a una zona',
  ASIGNACION_MODIFICADA: 'Asignación modificada',
  ASIGNACION_CANCELADA: 'Asignación cancelada',
  ASIGNACION_CONFIRMADA: 'Confirmó la asignación',
  ASIGNACION_RECHAZADA: 'Rechazó la asignación'
};

export function etiquetaAccion(accion: string): string {
  return ACCIONES[accion] ?? accion;
}

const CAMPOS: Record<string, string> = {
  nombre: 'nombre',
  rol: 'rol',
  credencial: 'credencial',
  documento: 'documento',
  correo: 'correo',
  telefono: 'teléfono'
};

/** Resumen legible del `detalle` de una entrada de auditoría. */
export function resumenAuditoria(detalle: Record<string, unknown>): string {
  const cambios = detalle['cambios'] as Record<string, { antes: unknown; despues: unknown }> | undefined;
  if (cambios) {
    return Object.entries(cambios)
      .map(([campo, c]) => `${CAMPOS[campo] ?? campo}: ${c.antes ?? '—'} → ${c.despues ?? '—'}`)
      .join(' · ');
  }
  const partes: string[] = [];
  if (detalle['zona']) partes.push(`Zona ${detalle['zona']}`);
  if (detalle['motivo']) partes.push(`Motivo: ${detalle['motivo']}`);
  const cancelados = detalle['turnosCancelados'] as unknown[] | undefined;
  if (cancelados?.length) partes.push(`${cancelados.length} turno(s) cancelado(s)`);
  return partes.join(' · ');
}

/** `yyyy-MM-dd` y `HH:mm` en hora local, para los controles nativos de fecha y hora. */
export function aControles(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return { fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
}

/**
 * Fecha + horas locales → instantes ISO. Si la hora de fin es menor o igual a
 * la de inicio, el turno cruza la medianoche y termina al día siguiente.
 */
export function desdeControles(fecha: string, inicio: string, fin: string): { horaInicio: string; horaFin: string } | null {
  if (!fecha || !inicio || !fin) return null;
  const a = new Date(`${fecha}T${inicio}`);
  const b = new Date(`${fecha}T${fin}`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  if (b <= a) b.setDate(b.getDate() + 1);
  return { horaInicio: a.toISOString(), horaFin: b.toISOString() };
}

export function horasEntre(horaInicio: string, horaFin: string): number {
  return (new Date(horaFin).getTime() - new Date(horaInicio).getTime()) / 3_600_000;
}
