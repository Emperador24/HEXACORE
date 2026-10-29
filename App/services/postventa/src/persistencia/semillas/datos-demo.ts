/**
 * Proyección de eventos para la reventa.
 *
 * Son los mismos ids que siembra Ventas: es la misma proyección en otra base
 * (ADR-14). Hasta que *Eventos y recintos* la publique por el broker, hay que
 * sembrar las dos — igual que Catálogo y Acceso QR, que tienen la suya.
 *
 * Lleva **siete campos y no quince**: de un evento, la reventa solo necesita
 * saber cómo se llama, cuándo y dónde es, y si permite revender. La categoría,
 * el artista y la imagen son de la cartelera; el aforo, de la puerta. Copiar lo
 * que no se lee obligaría a migrar esta base cada vez que cambiara un campo de
 * otro servicio.
 *
 * `permiteReventa: false` en algunos eventos no es decorativo: es lo que
 * ejercita el camino CU-006F, y el evento ya celebrado ejercita CU-006D.
 */

const dias = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

export interface EventoDemo {
  eventoId: string;
  nombre: string;
  fechaInicio: Date;
  lugar: string;
  ciudad: string;
  permiteReventa: boolean;
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

export const EVENTOS: EventoDemo[] = [
  {
    eventoId: 'e0000001-0000-4000-8000-000000000001',
    nombre: 'HEXACORE Fest 2026',
    fechaInicio: FEST,
    lugar: 'Movistar Arena',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000002-0000-4000-8000-000000000002',
    nombre: 'Noche de Rock Nacional',
    fechaInicio: ROCK,
    lugar: 'Coliseo El Campín',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000003-0000-4000-8000-000000000003',
    nombre: 'Gala Benéfica Javeriana',
    fechaInicio: GALA,
    lugar: 'Teatro Colón',
    ciudad: 'Bogotá',
    permiteReventa: false,
  },
  {
    eventoId: 'e0000004-0000-4000-8000-000000000004',
    nombre: 'Festival de Verano 2026',
    fechaInicio: VERANO,
    lugar: 'Parque Simón Bolívar',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000005-0000-4000-8000-000000000005',
    nombre: 'Feria Gastronómica',
    fechaInicio: FERIA,
    lugar: 'Corferias',
    ciudad: 'Bogotá',
    permiteReventa: false,
  },
  {
    eventoId: 'e0000006-0000-4000-8000-000000000006',
    nombre: 'Sinfónica de Medellín',
    fechaInicio: SINFONICA,
    lugar: 'Teatro Metropolitano',
    ciudad: 'Medellín',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000007-0000-4000-8000-000000000007',
    nombre: 'Clásico del Fútbol Colombiano',
    fechaInicio: CLASICO,
    lugar: 'Estadio Atanasio Girardot',
    ciudad: 'Medellín',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000008-0000-4000-8000-000000000008',
    nombre: 'Salsa al Parque',
    fechaInicio: SALSA,
    lugar: 'Plaza de Toros',
    ciudad: 'Cali',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000009-0000-4000-8000-000000000009',
    nombre: 'Bogotá Coffee Week',
    fechaInicio: CAFE,
    lugar: 'Ágora',
    ciudad: 'Bogotá',
    permiteReventa: false,
  },
  {
    eventoId: 'e000000a-0000-4000-8000-00000000000a',
    nombre: 'El Mago de Oz — Musical',
    fechaInicio: MAGO,
    lugar: 'Teatro Colsubsidio',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    eventoId: 'e000000c-0000-4000-8000-00000000000c',
    nombre: 'Noche de Stand-up',
    fechaInicio: dias(4),
    lugar: 'Teatro Pablo Tobón Uribe',
    ciudad: 'Medellín',
    permiteReventa: true,
  },
  {
    eventoId: 'e000000d-0000-4000-8000-00000000000d',
    nombre: 'Jazz al Atardecer',
    fechaInicio: dias(0.8),
    lugar: 'Teatro Mayor Julio Mario Santo Domingo',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    eventoId: 'e000000b-0000-4000-8000-00000000000b',
    nombre: 'Torneo Nacional de Voleibol',
    fechaInicio: dias(20),
    lugar: 'Coliseo El Pueblo',
    ciudad: 'Cali',
    permiteReventa: true,
  },
];
