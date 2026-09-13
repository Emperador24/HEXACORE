import { Injectable, computed, signal } from '@angular/core';
import { Evento } from './models';

/**
 * CU-001..CU-005 (consulta de eventos) — datos en memoria mientras no existe
 * el API Gateway, igual que MockData.eventos en app-movil. Cada evento trae
 * sus zonas de venta, que es lo que la app móvil no necesita mostrar (ella
 * solo ve entradas ya compradas) pero este portal sí, porque aquí es donde
 * se compran (CU-006).
 *
 * La cartelera es deliberadamente variada en ciudad y categoría: son los dos
 * filtros de la página de eventos, y con un solo tipo de evento en una sola
 * ciudad no se podría comprobar que funcionan.
 */
@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly _eventos = signal<Evento[]>([
    {
      id: 'evt-1',
      nombre: 'HEXACORE Fest 2026',
      fecha: '2026-12-12',
      lugar: 'Movistar Arena',
      ciudad: 'Bogotá',
      categoria: 'Festivales',
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
      lugar: 'Coliseo El Campín',
      ciudad: 'Bogotá',
      categoria: 'Conciertos',
      precioDesde: 95000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-2/600/800',
      zonas: [
        { nombre: 'General', precio: 95000 },
        { nombre: 'Tribuna', precio: 140000 }
      ]
    },
    {
      id: 'evt-3',
      nombre: 'Feria Gastronómica',
      fecha: '2026-10-05',
      lugar: 'Corferias',
      ciudad: 'Bogotá',
      categoria: 'Gastronomía',
      precioDesde: 40000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-3/600/800',
      zonas: [{ nombre: 'General', precio: 40000 }]
    },
    {
      id: 'evt-4',
      nombre: 'Festival de Verano 2026',
      fecha: '2026-06-15',
      lugar: 'Parque Simón Bolívar',
      ciudad: 'Bogotá',
      categoria: 'Festivales',
      precioDesde: 65000,
      pasado: true,
      imagenUrl: 'https://picsum.photos/seed/evt-4/600/800',
      zonas: [{ nombre: 'General', precio: 65000 }]
    },
    {
      id: 'evt-5',
      nombre: 'Sinfónica de Medellín',
      fecha: '2026-11-08',
      lugar: 'Teatro Metropolitano',
      ciudad: 'Medellín',
      categoria: 'Teatro',
      precioDesde: 70000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-5/600/800',
      zonas: [
        { nombre: 'Luneta', precio: 70000 },
        { nombre: 'Balcón', precio: 110000 }
      ]
    },
    {
      id: 'evt-6',
      nombre: 'Clásico del Fútbol Colombiano',
      fecha: '2026-10-25',
      lugar: 'Estadio Atanasio Girardot',
      ciudad: 'Medellín',
      categoria: 'Deportes',
      precioDesde: 55000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-6/600/800',
      zonas: [
        { nombre: 'Norte', precio: 55000 },
        { nombre: 'Occidental', precio: 130000 }
      ]
    },
    {
      id: 'evt-7',
      nombre: 'Salsa al Parque',
      fecha: '2026-11-21',
      lugar: 'Plaza de Toros',
      ciudad: 'Cali',
      categoria: 'Conciertos',
      precioDesde: 60000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-7/600/800',
      zonas: [
        { nombre: 'General', precio: 60000 },
        { nombre: 'Preferencial', precio: 95000 }
      ]
    },
    {
      id: 'evt-8',
      nombre: 'Bogotá Coffee Week',
      fecha: '2026-09-28',
      lugar: 'Ágora',
      ciudad: 'Bogotá',
      categoria: 'Gastronomía',
      precioDesde: 35000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-8/600/800',
      zonas: [{ nombre: 'Entrada general', precio: 35000 }]
    },
    {
      id: 'evt-9',
      nombre: 'El Mago de Oz — Musical',
      fecha: '2026-12-05',
      lugar: 'Teatro Colsubsidio',
      ciudad: 'Bogotá',
      categoria: 'Teatro',
      precioDesde: 85000,
      pasado: false,
      imagenUrl: 'https://picsum.photos/seed/evt-9/600/800',
      zonas: [
        { nombre: 'Platea', precio: 85000 },
        { nombre: 'Palco', precio: 150000 }
      ]
    },
    {
      id: 'evt-10',
      nombre: 'Torneo Nacional de Voleibol',
      fecha: '2026-08-30',
      lugar: 'Coliseo El Pueblo',
      ciudad: 'Cali',
      categoria: 'Deportes',
      precioDesde: 30000,
      pasado: true,
      imagenUrl: 'https://picsum.photos/seed/evt-10/600/800',
      zonas: [{ nombre: 'General', precio: 30000 }]
    }
  ]);

  readonly eventos = this._eventos.asReadonly();

  /** Ciudades presentes en la cartelera, para el filtro de la página de eventos. */
  readonly ciudades = computed(() => [...new Set(this._eventos().map((e) => e.ciudad))].sort());

  obtenerPorId(id: string): Evento | undefined {
    return this._eventos().find((e) => e.id === id);
  }
}
