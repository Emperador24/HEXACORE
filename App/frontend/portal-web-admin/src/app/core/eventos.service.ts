import { Injectable, signal } from '@angular/core';
import { EstadoEvento, Evento } from './models';

const EVENTOS_INICIALES: Evento[] = [
  { id: 'evt-1', nombre: 'HEXACORE Fest 2026', fecha: '2026-12-12', recinto: 'Movistar Arena, Bogotá', aforo: 12000, estado: EstadoEvento.PUBLICADO },
  { id: 'evt-2', nombre: 'Noche de Rock Nacional', fecha: '2026-09-20', recinto: 'Coliseo El Campín, Bogotá', aforo: 8000, estado: EstadoEvento.PLANIFICACION },
  { id: 'evt-3', nombre: 'Feria Gastronómica', fecha: '2026-10-05', recinto: 'Corferias, Bogotá', aforo: 5000, estado: EstadoEvento.PUBLICADO }
];

/**
 * CU-026 (Gestión de Eventos — CRUD) y CU-016 (Planificar logística) — datos
 * en memoria mientras no existe el API Gateway, igual que MockData en
 * app-movil-cliente. El estado se expone como signal de solo lectura para
 * que la lista se refresque sola al crear/editar/eliminar.
 */
@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly _eventos = signal<Evento[]>(EVENTOS_INICIALES);
  readonly eventos = this._eventos.asReadonly();

  obtenerPorId(id: string): Evento | undefined {
    return this._eventos().find((e) => e.id === id);
  }

  crear(datos: Omit<Evento, 'id'>): void {
    const nuevo: Evento = { ...datos, id: `evt-${Date.now()}` };
    this._eventos.update((lista) => [nuevo, ...lista]);
  }

  actualizar(id: string, datos: Omit<Evento, 'id'>): void {
    this._eventos.update((lista) => lista.map((e) => (e.id === id ? { ...datos, id } : e)));
  }

  eliminar(id: string): void {
    this._eventos.update((lista) => lista.filter((e) => e.id !== id));
  }
}
