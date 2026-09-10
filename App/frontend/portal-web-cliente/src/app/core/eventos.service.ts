import { Injectable, signal } from '@angular/core';
import { Evento } from './models';

/**
 * CU-001..CU-005 (consulta de eventos) — datos en memoria mientras no existe
 * el API Gateway, igual que MockData.eventos en app-movil-cliente. Cada
 * evento trae sus zonas de venta, que es lo que la app móvil no necesita
 * mostrar (ella solo ve entradas ya compradas) pero este portal sí, porque
 * aquí es donde se compran (CU-006).
 */
@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly _eventos = signal<Evento[]>([
    {
      id: 'evt-1',
      nombre: 'HEXACORE Fest 2026',
      fecha: '2026-12-12',
      lugar: 'Movistar Arena, Bogotá',
      precioDesde: 180000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-1/600/800',
      zonas: [
        { nombre: 'General', precio: 180000 },
        { nombre: 'Platea Baja', precio: 260000 },
        { nombre: 'Palco VIP', precio: 420000 }
      ]
    },
    {
      id: 'evt-2',
      nombre: 'Noche de Rock Nacional',
      fecha: '2026-09-20',
      lugar: 'Coliseo El Campín, Bogotá',
      precioDesde: 95000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-2/600/800',
      zonas: [{ nombre: 'General', precio: 95000 }]
    },
    {
      id: 'evt-3',
      nombre: 'Feria Gastronómica',
      fecha: '2026-10-05',
      lugar: 'Corferias, Bogotá',
      precioDesde: 40000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-3/600/800',
      zonas: [{ nombre: 'General', precio: 40000 }]
    },
    {
      id: 'evt-4',
      nombre: 'Festival de Verano 2026',
      fecha: '2026-06-15',
      lugar: 'Parque Simón Bolívar, Bogotá',
      precioDesde: 65000,
      pasado: true,
      imagenUrl: 'https://picsum.photos/seed/evt-4/600/800',
      zonas: [{ nombre: 'General', precio: 65000 }]
    }
  ]);

  readonly eventos = this._eventos.asReadonly();

  obtenerPorId(id: string): Evento | undefined {
    return this._eventos().find((e) => e.id === id);
  }
}
