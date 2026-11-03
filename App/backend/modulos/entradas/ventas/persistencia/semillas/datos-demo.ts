import { EstadoEntrada } from '../entidades/entrada.entity';
import { EstadoEvento } from '../entidades/evento-referencia.entity';

/**
 * Datos de demostración del CU-006.
 *
 * No son datos "de relleno": cada entrada existe para poder ejercitar un
 * camino concreto de la ficha del caso de uso sin tener que fabricar el estado
 * a mano cada vez. La columna "para qué" de las tablas de abajo dice cuál.
 *
 * Los identificadores son fijos y legibles a propósito (`a0000001-…` para
 * usuarios, `e…` para eventos, `20…` para entradas): así una petición de
 * prueba se puede escribir sin consultar antes la base, y los ejemplos de la
 * documentación siguen siendo válidos después de volver a sembrar.
 */

/** Usuarios de demostración. Viven en `administracion`; aquí solo se referencian por id. */
export const USUARIOS = {
  ana: { id: 'a0000001-0000-4000-8000-000000000001', nombre: 'Ana Gómez' },
  bruno: { id: 'a0000002-0000-4000-8000-000000000002', nombre: 'Bruno Díaz' },
  carla: { id: 'a0000003-0000-4000-8000-000000000003', nombre: 'Carla Ruiz' },
} as const;

const dias = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
/** `inicio` más unas horas: el fin del evento, para el horario del CU-005. */
const mas = (inicio: Date, horas: number): Date => new Date(inicio.getTime() + horas * 60 * 60 * 1000);
const imagen = (semilla: string): string => `https://picsum.photos/seed/${semilla}/600/800`;

export interface EventoDemo {
  eventoId: string;
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date | null;
  lugar: string;
  ciudad: string;
  permiteReventa: boolean;
  estado: EstadoEvento;
  categoria: string;
  artista: string | null;
  descripcion: string | null;
  imagenUrl: string | null;
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
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Festivales',
    artista: 'Aterciopelados',
    descripcion: 'Diez horas de música en vivo con artistas nacionales e internacionales.',
    imagenUrl: imagen('evt-1'),
  },
  {
    eventoId: 'e0000002-0000-4000-8000-000000000002',
    nombre: 'Noche de Rock Nacional',
    fechaInicio: ROCK,
    fechaFin: mas(ROCK, 5),
    lugar: 'Coliseo El Campín',
    ciudad: 'Bogotá',
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Conciertos',
    artista: 'Diamante Eléctrico',
    descripcion: 'Lo mejor del rock colombiano en una sola noche.',
    imagenUrl: imagen('evt-2'),
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
    permiteReventa: false,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Teatro',
    artista: null,
    descripcion: 'Gala a beneficio de las becas de la universidad.',
    imagenUrl: imagen('evt-gala'),
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
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Festivales',
    artista: null,
    descripcion: 'El festival gratuito más grande de la ciudad.',
    imagenUrl: imagen('evt-4'),
  },
  {
    eventoId: 'e0000005-0000-4000-8000-000000000005',
    nombre: 'Feria Gastronómica',
    fechaInicio: FERIA,
    fechaFin: mas(FERIA, 9),
    lugar: 'Corferias',
    ciudad: 'Bogotá',
    permiteReventa: false,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Gastronomía',
    // Sin artista: el filtro por artista nunca debe devolverla.
    artista: null,
    descripcion: 'Más de 80 restaurantes y productores locales.',
    imagenUrl: imagen('evt-3'),
  },
  {
    eventoId: 'e0000006-0000-4000-8000-000000000006',
    nombre: 'Sinfónica de Medellín',
    fechaInicio: SINFONICA,
    fechaFin: mas(SINFONICA, 2),
    lugar: 'Teatro Metropolitano',
    ciudad: 'Medellín',
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Teatro',
    artista: 'Orquesta Filarmónica de Medellín',
    descripcion: 'Programa de temporada: Beethoven y Dvořák.',
    imagenUrl: imagen('evt-5'),
  },
  {
    eventoId: 'e0000007-0000-4000-8000-000000000007',
    nombre: 'Clásico del Fútbol Colombiano',
    fechaInicio: CLASICO,
    fechaFin: mas(CLASICO, 2),
    lugar: 'Estadio Atanasio Girardot',
    ciudad: 'Medellín',
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Deportes',
    artista: null,
    descripcion: 'El partido más esperado de la temporada.',
    imagenUrl: imagen('evt-6'),
  },
  {
    // Agotado: todas sus localidades están vendidas.
    eventoId: 'e0000008-0000-4000-8000-000000000008',
    nombre: 'Salsa al Parque',
    fechaInicio: SALSA,
    fechaFin: mas(SALSA, 6),
    lugar: 'Plaza de Toros',
    ciudad: 'Cali',
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Conciertos',
    artista: 'Grupo Niche',
    descripcion: 'La capital de la salsa celebra a su orquesta insignia.',
    imagenUrl: imagen('evt-7'),
  },
  {
    eventoId: 'e0000009-0000-4000-8000-000000000009',
    nombre: 'Bogotá Coffee Week',
    fechaInicio: CAFE,
    fechaFin: mas(CAFE, 8),
    lugar: 'Ágora',
    ciudad: 'Bogotá',
    permiteReventa: false,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Gastronomía',
    artista: null,
    descripcion: 'Catas, baristas y fincas cafeteras de todo el país.',
    imagenUrl: imagen('evt-8'),
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
    permiteReventa: true,
    estado: EstadoEvento.BORRADOR,
    categoria: 'Teatro',
    artista: 'Compañía Nacional de Musicales',
    descripcion: null,
    imagenUrl: imagen('evt-9'),
  },
  {
    // A 4 días: cancelar sus entradas da reembolso PARCIAL (CU-003A).
    eventoId: 'e000000c-0000-4000-8000-00000000000c',
    nombre: 'Noche de Stand-up',
    fechaInicio: dias(4),
    fechaFin: mas(dias(4), 2),
    lugar: 'Teatro Pablo Tobón Uribe',
    ciudad: 'Medellín',
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Teatro',
    artista: 'Alejandro Riaño',
    descripcion: 'Dos horas de comedia en vivo.',
    imagenUrl: imagen('evt-standup'),
  },
  {
    // En menos de un día: ya no admite cancelaciones (fuera de plazo).
    eventoId: 'e000000d-0000-4000-8000-00000000000d',
    nombre: 'Jazz al Atardecer',
    fechaInicio: dias(0.8),
    fechaFin: mas(dias(0.8), 3),
    lugar: 'Teatro Mayor Julio Mario Santo Domingo',
    ciudad: 'Bogotá',
    permiteReventa: true,
    estado: EstadoEvento.PUBLICADO,
    categoria: 'Conciertos',
    artista: 'Antonio Arnedo',
    descripcion: 'Jazz colombiano con vista al atardecer.',
    imagenUrl: imagen('evt-jazz'),
  },
  {
    // Cancelado: tampoco debe verse.
    eventoId: 'e000000b-0000-4000-8000-00000000000b',
    nombre: 'Torneo Nacional de Voleibol',
    fechaInicio: dias(20),
    fechaFin: null,
    lugar: 'Coliseo El Pueblo',
    ciudad: 'Cali',
    permiteReventa: true,
    estado: EstadoEvento.CANCELADO,
    categoria: 'Deportes',
    artista: null,
    descripcion: null,
    imagenUrl: imagen('evt-10'),
  },
];

export interface EntradaDemo {
  id: string;
  eventoId: string;
  localidadId: string;
  localidadNombre: string;
  propietarioId: string;
  codigoQr: string;
  estado: EstadoEntrada;
  precioOriginal: number;
  numeroTicket: string;
  /** Qué camino del CU-006 permite probar esta entrada. */
  paraQue: string;
}

const LOCALIDADES = {
  fest_general: '10000001-0000-4000-8000-000000000001',
  fest_palco: '10000001-0000-4000-8000-000000000002',
  rock_general: '10000002-0000-4000-8000-000000000001',
  gala_platea: '10000003-0000-4000-8000-000000000001',
  verano_general: '10000004-0000-4000-8000-000000000001',
} as const;

export interface LocalidadDemo {
  localidadId: string;
  eventoId: string;
  nombre: string;
  precio: number;
  aforo: number;
  /**
   * Cupos ya vendidos. Representa la venta primaria (CU-001) acumulada: no
   * hay una fila en `entradas` por cada uno, solo las que el CU-006 necesita.
   */
  vendidas: number;
  orden: number;
}

/**
 * Localidades de la cartelera (CU-005). Las cinco primeras reutilizan los ids
 * de `LOCALIDADES`, que son a los que apuntan las entradas del CU-006: así la
 * entrada "Palco VIP" de Ana es de la misma localidad que muestra el detalle.
 *
 * Casos que dejan probar: Clásico tiene su localidad más barata agotada
 * (el "desde" debe ser el de la otra), y Salsa las tiene agotadas todas.
 */
export const LOCALIDADES_EVENTO: LocalidadDemo[] = [
  { localidadId: LOCALIDADES.fest_general, eventoId: EVENTOS[0].eventoId, nombre: 'General', precio: 180_000, aforo: 5000, vendidas: 4200, orden: 1 },
  { localidadId: '10000001-0000-4000-8000-000000000003', eventoId: EVENTOS[0].eventoId, nombre: 'Platea Baja', precio: 260_000, aforo: 1500, vendidas: 900, orden: 2 },
  { localidadId: LOCALIDADES.fest_palco, eventoId: EVENTOS[0].eventoId, nombre: 'Palco VIP', precio: 420_000, aforo: 200, vendidas: 163, orden: 3 },
  { localidadId: LOCALIDADES.rock_general, eventoId: EVENTOS[1].eventoId, nombre: 'General', precio: 95_000, aforo: 3000, vendidas: 1200, orden: 1 },
  { localidadId: '10000002-0000-4000-8000-000000000002', eventoId: EVENTOS[1].eventoId, nombre: 'Tribuna', precio: 140_000, aforo: 800, vendidas: 150, orden: 2 },
  { localidadId: LOCALIDADES.gala_platea, eventoId: EVENTOS[2].eventoId, nombre: 'Platea', precio: 300_000, aforo: 400, vendidas: 120, orden: 1 },
  { localidadId: LOCALIDADES.verano_general, eventoId: EVENTOS[3].eventoId, nombre: 'General', precio: 65_000, aforo: 20000, vendidas: 18000, orden: 1 },
  { localidadId: '10000005-0000-4000-8000-000000000001', eventoId: EVENTOS[4].eventoId, nombre: 'General', precio: 40_000, aforo: 6000, vendidas: 800, orden: 1 },
  { localidadId: '10000006-0000-4000-8000-000000000001', eventoId: EVENTOS[5].eventoId, nombre: 'Luneta', precio: 70_000, aforo: 900, vendidas: 300, orden: 1 },
  { localidadId: '10000006-0000-4000-8000-000000000002', eventoId: EVENTOS[5].eventoId, nombre: 'Balcón', precio: 110_000, aforo: 400, vendidas: 60, orden: 2 },
  { localidadId: '10000007-0000-4000-8000-000000000001', eventoId: EVENTOS[6].eventoId, nombre: 'Norte', precio: 55_000, aforo: 12000, vendidas: 12000, orden: 1 },
  { localidadId: '10000007-0000-4000-8000-000000000002', eventoId: EVENTOS[6].eventoId, nombre: 'Occidental', precio: 130_000, aforo: 8000, vendidas: 7100, orden: 2 },
  { localidadId: '10000008-0000-4000-8000-000000000001', eventoId: EVENTOS[7].eventoId, nombre: 'General', precio: 60_000, aforo: 4000, vendidas: 4000, orden: 1 },
  { localidadId: '10000008-0000-4000-8000-000000000002', eventoId: EVENTOS[7].eventoId, nombre: 'Preferencial', precio: 95_000, aforo: 1000, vendidas: 1000, orden: 2 },
  { localidadId: '10000009-0000-4000-8000-000000000001', eventoId: EVENTOS[8].eventoId, nombre: 'Entrada general', precio: 35_000, aforo: 2500, vendidas: 400, orden: 1 },
  { localidadId: '1000000a-0000-4000-8000-000000000001', eventoId: EVENTOS[9].eventoId, nombre: 'Platea', precio: 85_000, aforo: 700, vendidas: 0, orden: 1 },
  { localidadId: '1000000c-0000-4000-8000-000000000001', eventoId: EVENTOS[10].eventoId, nombre: 'General', precio: 70_000, aforo: 600, vendidas: 240, orden: 1 },
  // Solo 3 cupos: sirve para ver CU-001A pidiendo 4.
  { localidadId: '1000000d-0000-4000-8000-000000000001', eventoId: EVENTOS[11].eventoId, nombre: 'Terraza', precio: 150_000, aforo: 100, vendidas: 97, orden: 1 },
];

export interface PromocionDemo {
  codigo: string;
  descripcion: string;
  porcentaje: number;
  eventoId: string | null;
  localidadId: string | null;
  vigenteDesde: Date;
  vigenteHasta: Date;
  limiteUsos: number | null;
  usos: number;
  /** Qué camino del CU-004 permite probar. */
  paraQue: string;
}

/** Códigos promocionales del CU-004: uno por camino de la ficha. */
export const PROMOCIONES: PromocionDemo[] = [
  {
    codigo: 'HEXA10',
    descripcion: '10 % en cualquier evento',
    porcentaje: 10,
    eventoId: null,
    localidadId: null,
    vigenteDesde: dias(-30),
    vigenteHasta: dias(180),
    limiteUsos: 100,
    usos: 0,
    paraQue: 'Camino feliz (pasos 1-9)',
  },
  {
    codigo: 'ROCK20',
    descripcion: '20 % en Noche de Rock Nacional',
    porcentaje: 20,
    eventoId: EVENTOS[1].eventoId,
    localidadId: null,
    vigenteDesde: dias(-30),
    vigenteHasta: dias(40),
    limiteUsos: null,
    usos: 0,
    paraQue: 'Solo un evento: en cualquier otro, CU-004A',
  },
  {
    codigo: 'VIP15',
    descripcion: '15 % en Palco VIP del HEXACORE Fest',
    porcentaje: 15,
    eventoId: EVENTOS[0].eventoId,
    localidadId: LOCALIDADES.fest_palco,
    vigenteDesde: dias(-30),
    vigenteHasta: dias(80),
    limiteUsos: 50,
    usos: 0,
    paraQue: 'Solo una localidad: en General del mismo evento, CU-004A',
  },
  {
    codigo: 'ULTIMO',
    descripcion: '25 % para el primero que lo use',
    porcentaje: 25,
    eventoId: null,
    localidadId: null,
    vigenteDesde: dias(-30),
    vigenteHasta: dias(30),
    limiteUsos: 1,
    usos: 1,
    paraQue: 'Límite de usos alcanzado (CU-004D)',
  },
  {
    codigo: 'VERANO5',
    descripcion: '5 % de la temporada pasada',
    porcentaje: 5,
    eventoId: null,
    localidadId: null,
    vigenteDesde: dias(-200),
    vigenteHasta: dias(-100),
    limiteUsos: null,
    usos: 0,
    paraQue: 'Vencido (CU-004C)',
  },
];

export const ENTRADAS: EntradaDemo[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    eventoId: EVENTOS[0].eventoId,
    localidadId: LOCALIDADES.fest_general,
    localidadNombre: 'General',
    propietarioId: USUARIOS.ana.id,
    codigoQr: 'HXC-QR-000001',
    estado: EstadoEntrada.VALIDA,
    precioOriginal: 250_000,
    numeroTicket: 'TCK-2026-000001',
    paraQue: 'Camino feliz: Ana publica y Bruno compra (pasos 1-13)',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    eventoId: EVENTOS[0].eventoId,
    localidadId: LOCALIDADES.fest_palco,
    localidadNombre: 'Palco VIP',
    propietarioId: USUARIOS.ana.id,
    codigoQr: 'HXC-QR-000002',
    estado: EstadoEntrada.VALIDA,
    precioOriginal: 600_000,
    numeroTicket: 'TCK-2026-000002',
    paraQue: 'Cambiar precio (CU-006A) y retirar del mercado (CU-006B)',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    eventoId: EVENTOS[1].eventoId,
    localidadId: LOCALIDADES.rock_general,
    localidadNombre: 'General',
    propietarioId: USUARIOS.bruno.id,
    codigoQr: 'HXC-QR-000003',
    estado: EstadoEntrada.VALIDA,
    precioOriginal: 120_000,
    numeroTicket: 'TCK-2026-000003',
    paraQue: 'Compras simultáneas de dos compradores (CU-006H / RNF-01)',
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    eventoId: EVENTOS[1].eventoId,
    localidadId: LOCALIDADES.rock_general,
    localidadNombre: 'General',
    propietarioId: USUARIOS.carla.id,
    codigoQr: 'HXC-QR-000004',
    estado: EstadoEntrada.VALIDA,
    precioOriginal: 120_000,
    numeroTicket: 'TCK-2026-000004',
    paraQue: 'Pago rechazado (CU-006G) y fallo de la pasarela (CU-006I)',
  },
  {
    id: '20000000-0000-4000-8000-000000000005',
    eventoId: EVENTOS[3].eventoId,
    localidadId: LOCALIDADES.verano_general,
    localidadNombre: 'General',
    propietarioId: USUARIOS.ana.id,
    codigoQr: 'HXC-QR-000005',
    estado: EstadoEntrada.USADA,
    precioOriginal: 80_000,
    numeroTicket: 'TCK-2026-000005',
    paraQue: 'Entrada ya utilizada (CU-006E)',
  },
  {
    id: '20000000-0000-4000-8000-000000000006',
    eventoId: EVENTOS[0].eventoId,
    localidadId: LOCALIDADES.fest_general,
    localidadNombre: 'General',
    propietarioId: USUARIOS.bruno.id,
    codigoQr: 'HXC-QR-000006',
    estado: EstadoEntrada.ANULADA,
    precioOriginal: 250_000,
    numeroTicket: 'TCK-2026-000006',
    paraQue: 'Entrada invalidada (CU-006E, la otra mitad del camino)',
  },
  {
    // Válida, pero de un evento que ya se celebró: su ventana de reventa está
    // cerrada. Sin ella no había forma de ejercitar CU-006D al publicar — la
    // única entrada de evento pasado estaba USADA, y ganaba CU-006E.
    id: '20000000-0000-4000-8000-000000000008',
    eventoId: EVENTOS[3].eventoId,
    localidadId: LOCALIDADES.verano_general,
    localidadNombre: 'General',
    propietarioId: USUARIOS.bruno.id,
    codigoQr: 'HXC-QR-000008',
    estado: EstadoEntrada.VALIDA,
    precioOriginal: 80_000,
    numeroTicket: 'TCK-2026-000008',
    paraQue: 'La ventana de reventa ya se cerró (CU-006D al publicar)',
  },
  {
    id: '20000000-0000-4000-8000-000000000007',
    eventoId: EVENTOS[2].eventoId,
    localidadId: LOCALIDADES.gala_platea,
    localidadNombre: 'Platea',
    propietarioId: USUARIOS.carla.id,
    codigoQr: 'HXC-QR-000007',
    estado: EstadoEntrada.VALIDA,
    precioOriginal: 300_000,
    numeroTicket: 'TCK-2026-000007',
    paraQue: 'El evento no permite reventa (CU-006F)',
  },
];
