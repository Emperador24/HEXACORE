import { Injectable, signal } from '@angular/core';
import { ReservaParqueadero } from './models';

/** Zonas y tarifa quemadas mientras no existe el API Gateway — la tarifa real la fija el Administrador desde el Portal Web Admin. */
export const ZONAS_PARQUEADERO = ['Zona A', 'Zona B', 'Zona C'];
export const TARIFA_PARQUEADERO = 15000;

function nuevoEspacio(zona: string): string {
  const letra = zona.replace('Zona ', '');
  return `${letra}-${String(Math.floor(1 + Math.random() * 40)).padStart(2, '0')}`;
}

/**
 * Reservas de parqueadero del cliente (CU-021..CU-025) — a diferencia de
 * app-movil-cliente (que solo muestra reservas ya pagadas y su tiempo en
 * vivo, ver ParqueaderoScreen allá), aquí es donde se genera la reserva
 * nueva, igual que la compra de entradas.
 */
@Injectable({ providedIn: 'root' })
export class ParqueaderoService {
  private readonly _reservas = signal<ReservaParqueadero[]>([
    {
      id: 'res-1',
      eventoId: 'evt-1',
      eventoNombre: 'HEXACORE Fest 2026',
      lugarEvento: 'Movistar Arena, Bogotá',
      zona: 'Zona B',
      espacioId: 'B-04',
      codigoQr: 'HXC-PARK-000045',
      numeroTransaccion: 'TXN-2026-000601'
    }
  ]);

  readonly reservas = this._reservas.asReadonly();

  reservar(datos: { eventoId: string; eventoNombre: string; lugarEvento: string; zona: string }): void {
    const nueva: ReservaParqueadero = {
      id: `res-${Date.now()}`,
      eventoId: datos.eventoId,
      eventoNombre: datos.eventoNombre,
      lugarEvento: datos.lugarEvento,
      zona: datos.zona,
      espacioId: nuevoEspacio(datos.zona),
      codigoQr: `HXC-PARK-${Math.floor(100000 + Math.random() * 900000)}`,
      numeroTransaccion: `TXN-2026-${Math.floor(100000 + Math.random() * 900000)}`
    };
    this._reservas.update((lista) => [nueva, ...lista]);
  }
}
