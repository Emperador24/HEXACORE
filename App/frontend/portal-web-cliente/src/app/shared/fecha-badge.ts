/** Las tres partes del badge de fecha estilo taquilla ("28 · NOV · Sáb"). */
export interface FechaBadge {
  dia: string;
  mes: string;
  dow: string;
}

const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', { day: 'numeric' });
const FORMATO_MES = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const FORMATO_DOW = new Intl.DateTimeFormat('es-CO', { weekday: 'short' });

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '');
}

/** A partir de una fecha yyyy-MM-dd (la que entrega <input type="date">), arma el badge. */
export function fechaBadge(fechaIso: string): FechaBadge {
  const fecha = new Date(`${fechaIso}T00:00:00`);
  return {
    dia: FORMATO_DIA.format(fecha),
    mes: capitalizar(FORMATO_MES.format(fecha)),
    dow: capitalizar(FORMATO_DOW.format(fecha))
  };
}
