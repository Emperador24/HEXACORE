export enum EstadoTurno {
  ASIGNADO = 'ASIGNADO',
  CAMBIO_SOLICITADO = 'CAMBIO_SOLICITADO',
  CAMBIADO = 'CAMBIADO',
  CANCELADO = 'CANCELADO',
}

export enum EstadoSolicitudCambio {
  PENDIENTE = 'PENDIENTE',
  SIN_REEMPLAZO = 'SIN_REEMPLAZO',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  BLOQUEADA_POR_HORAS = 'BLOQUEADA_POR_HORAS',
  /** CU-008B: el empleado retiró la solicitud antes de que la revisaran. */
  CANCELADA = 'CANCELADA',
}

/** CU-008, paso 12 y CU-008C: lo que contestó el reemplazo a su nueva asignación. */
export enum RespuestaReemplazo {
  PENDIENTE = 'PENDIENTE',
  ACEPTADA = 'ACEPTADA',
  RECHAZADA = 'RECHAZADA',
}

export enum TipoRegistroAsistencia {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
}

/** CU-007: respuesta del empleado a una asignación. */
export enum ConfirmacionTurno {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  RECHAZADA = 'RECHAZADA',
}

/** CU-009A/B/C: cómo cae un registro respecto al horario del turno. */
export enum Puntualidad {
  ANTICIPADA = 'ANTICIPADA',
  A_TIEMPO = 'A_TIEMPO',
  TARDIA = 'TARDIA',
  POSTERIOR = 'POSTERIOR',
}
