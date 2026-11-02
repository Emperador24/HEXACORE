import { EstadoEvento } from '../entidades/evento-referencia.entity';

/**
 * Proyección de eventos para la puerta.
 *
 * Son los mismos ids que siembra Ventas: es la misma proyección en otra base
 * (ADR-14). Hasta que Eventos y recintos la publique por el broker, hay que
 * sembrar las dos.
 *
 * Lleva `aforoMaximo` y `asistentes`, que Catálogo no tiene: el aforo es de la
 * puerta, y `asistentes` ni siquiera es una copia — lo cuenta este servicio.
 */

const dias = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
/** `inicio` más unas horas: el fin del evento, para el horario del CU-005. */
const mas = (inicio: Date, horas: number): Date => new Date(inicio.getTime() + horas * 60 * 60 * 1000);
export interface EventoDemo {
  eventoId: string;
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  lugar: string;
  ciudad: string;
  estado: EstadoEvento;
  /** Aforo del recinto para el CU-002; ausente = sin tope propio. */
  aforoMaximo?: number | null;
  asistentes?: number;
}

const FEST = dias(90);
const ROCK = dias(45);
const GALA = dias(30);
const VERANO = dias(-90);
const FERIA = dias(16);
const SINFONICA = dias(50);
const CLASICO = dias(36);
const SALSA = dias(63);
const CAFE = dias(9);
const MAGO = dias(77);

/**
 * Los cuatro primeros son los del CU-006 y conservan sus ids y sus fechas: las
 * entradas de abajo apuntan a ellos. El resto existe para la cartelera
 * (CU-005): varía en ciudad, categoría y artista para que cada filtro tenga
 * algo que filtrar, y los dos últimos no deben verse nunca.
 */
export const EVENTOS: EventoDemo[] = [
  {
    eventoId: 'e0000001-0000-4000-8000-000000000001',
    nombre: 'HEXACORE Fest 2026',
    fechaInicio: FEST,
    fechaFin: mas(FEST, 10),
    lugar: 'Movistar Arena',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    eventoId: 'e0000002-0000-4000-8000-000000000002',
    nombre: 'Noche de Rock Nacional',
    fechaInicio: ROCK,
    fechaFin: mas(ROCK, 5),
    lugar: 'Coliseo El Campín',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    // Para el camino de excepción CU-006F ("El evento no permite reventa").
    // Y para CU-002B: su aforo está lleno, así que nadie más puede ingresar.
    eventoId: 'e0000003-0000-4000-8000-000000000003',
    nombre: 'Gala Benéfica Javeriana',
    fechaInicio: GALA,
    fechaFin: mas(GALA, 3),
    lugar: 'Teatro Colón',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
    aforoMaximo: 120,
    asistentes: 120,
  },
  {
    // Evento ya celebrado: toda publicación sobre él nace expirada (CU-006D).
    // En la cartelera solo aparece con `incluirPasados=true`.
    eventoId: 'e0000004-0000-4000-8000-000000000004',
    nombre: 'Festival de Verano 2026',
    fechaInicio: VERANO,
    fechaFin: mas(VERANO, 8),
    lugar: 'Parque Simón Bolívar',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    eventoId: 'e0000005-0000-4000-8000-000000000005',
    nombre: 'Feria Gastronómica',
    fechaInicio: FERIA,
    fechaFin: mas(FERIA, 9),
    lugar: 'Corferias',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
    // Sin artista: el filtro por artista nunca debe devolverla.
  },
  {
    eventoId: 'e0000006-0000-4000-8000-000000000006',
    nombre: 'Sinfónica de Medellín',
    fechaInicio: SINFONICA,
    fechaFin: mas(SINFONICA, 2),
    lugar: 'Teatro Metropolitano',
    ciudad: 'Medellín',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    eventoId: 'e0000007-0000-4000-8000-000000000007',
    nombre: 'Clásico del Fútbol Colombiano',
    fechaInicio: CLASICO,
    fechaFin: mas(CLASICO, 2),
    lugar: 'Estadio Atanasio Girardot',
    ciudad: 'Medellín',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    // Agotado: todas sus localidades están vendidas.
    eventoId: 'e0000008-0000-4000-8000-000000000008',
    nombre: 'Salsa al Parque',
    fechaInicio: SALSA,
    fechaFin: mas(SALSA, 6),
    lugar: 'Plaza de Toros',
    ciudad: 'Cali',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    eventoId: 'e0000009-0000-4000-8000-000000000009',
    nombre: 'Bogotá Coffee Week',
    fechaInicio: CAFE,
    fechaFin: mas(CAFE, 8),
    lugar: 'Ágora',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    // Borrador: el organizador aún no lo anuncia. No debe verse en la
    // cartelera ni en su detalle (404).
    eventoId: 'e000000a-0000-4000-8000-00000000000a',
    nombre: 'El Mago de Oz — Musical',
    fechaInicio: MAGO,
    fechaFin: mas(MAGO, 2),
    lugar: 'Teatro Colsubsidio',
    ciudad: 'Bogotá',
    estado: EstadoEvento.BORRADOR,
  },
  {
    // A 4 días: cancelar sus entradas da reembolso PARCIAL (CU-003A).
    eventoId: 'e000000c-0000-4000-8000-00000000000c',
    nombre: 'Noche de Stand-up',
    fechaInicio: dias(4),
    fechaFin: mas(dias(4), 2),
    lugar: 'Teatro Pablo Tobón Uribe',
    ciudad: 'Medellín',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    // En menos de un día: ya no admite cancelaciones (fuera de plazo).
    eventoId: 'e000000d-0000-4000-8000-00000000000d',
    nombre: 'Jazz al Atardecer',
    fechaInicio: dias(0.8),
    fechaFin: mas(dias(0.8), 3),
    lugar: 'Teatro Mayor Julio Mario Santo Domingo',
    ciudad: 'Bogotá',
    estado: EstadoEvento.PUBLICADO,
  },
  {
    // Cancelado: tampoco debe verse.
    eventoId: 'e000000b-0000-4000-8000-00000000000b',
    nombre: 'Torneo Nacional de Voleibol',
    fechaInicio: dias(20),
    fechaFin: null,
    lugar: 'Coliseo El Pueblo',
    ciudad: 'Cali',
    estado: EstadoEvento.CANCELADO,
  },
];
