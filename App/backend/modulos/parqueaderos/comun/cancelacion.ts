/**
 * Cancelación de reservas de parqueadero (CU-021, ampliación del 17/11).
 *
 * Una reserva pagada se cancela con devolución completa **solo si el evento es
 * otro día**: el mismo día del evento (en hora de Colombia) ya no se cancela ni
 * se devuelve. Por eso, quien reserva el mismo día queda avisado antes de pagar.
 * El parqueadero no depende de las entradas: la cuenta que reserva puede no
 * tener ninguna.
 */

/** El día calendario en Bogotá (`AAAA-MM-DD`), que es el que ve la persona. */
export const diaBogota = (fecha: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);

export interface PoliticaCancelacion {
  /** Si una reserva pagada se puede cancelar con devolución. */
  conDevolucion: boolean;
  mensaje: string;
}

export function politicaCancelacion(inicioEvento: Date, ahora = new Date()): PoliticaCancelacion {
  const conDevolucion = diaBogota(ahora) < diaBogota(new Date(inicioEvento));
  return {
    conDevolucion,
    mensaje: conDevolucion
      ? 'Puedes cancelarla con devolución completa hasta el día anterior al evento.'
      : 'El evento es hoy: esta reserva no se puede cancelar ni tiene devolución.',
  };
}
