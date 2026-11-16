import { Establecimiento, EstadoEstablecimiento } from '../persistencia/entidades/establecimiento.entity';

/** Intervalo diario [apertura,cierre); horas iguales significan atención 24 h. */
export function enHorario(e: Pick<Establecimiento, 'horaApertura' | 'horaCierre' | 'zonaHoraria'>, ahora = new Date()): boolean {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: e.zonaHoraria, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora);
  const hora = `${partes.find(p => p.type === 'hour')!.value}:${partes.find(p => p.type === 'minute')!.value}`;
  const abre = e.horaApertura.slice(0, 5), cierra = e.horaCierre.slice(0, 5);
  return abre === cierra || (abre < cierra ? hora >= abre && hora < cierra : hora >= abre || hora < cierra);
}

export function recibePedidos(e: Establecimiento, ahora = new Date()): boolean {
  return e.estado === EstadoEstablecimiento.DISPONIBLE && enHorario(e, ahora);
}
