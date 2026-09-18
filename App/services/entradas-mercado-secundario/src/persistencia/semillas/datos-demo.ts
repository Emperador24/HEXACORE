import { EstadoEntrada } from '../entidades/entrada.entity';

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

export interface EventoDemo {
  eventoId: string;
  nombre: string;
  fechaInicio: Date;
  lugar: string;
  ciudad: string;
  permiteReventa: boolean;
}

export const EVENTOS: EventoDemo[] = [
  {
    eventoId: 'e0000001-0000-4000-8000-000000000001',
    nombre: 'HEXACORE Fest 2026',
    fechaInicio: dias(90),
    lugar: 'Movistar Arena',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    eventoId: 'e0000002-0000-4000-8000-000000000002',
    nombre: 'Noche de Rock Nacional',
    fechaInicio: dias(45),
    lugar: 'Coliseo El Campín',
    ciudad: 'Bogotá',
    permiteReventa: true,
  },
  {
    // Para el camino de excepción CU-006F ("El evento no permite reventa").
    eventoId: 'e0000003-0000-4000-8000-000000000003',
    nombre: 'Gala Benéfica Javeriana',
    fechaInicio: dias(30),
    lugar: 'Teatro Colón',
    ciudad: 'Bogotá',
    permiteReventa: false,
  },
  {
    // Evento ya celebrado: toda publicación sobre él nace expirada (CU-006D).
    eventoId: 'e0000004-0000-4000-8000-000000000004',
    nombre: 'Festival de Verano 2026',
    fechaInicio: dias(-90),
    lugar: 'Parque Simón Bolívar',
    ciudad: 'Bogotá',
    permiteReventa: true,
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
