import { randomUUID } from 'node:crypto';
import type { Evento } from '../persistencia/entidades/evento.entity';
import type { Recinto } from '../persistencia/entidades/recinto.entity';

/**
 * Contrato de los cambios de un evento hacia Boletería (CU-026 → CU-001/003/005/006).
 * La explicación para quien consume está en `../CONTRATO-EVENTOS.md`; cambiar
 * algo aquí es cambiar ese documento.
 */
export const EXCHANGE_EVENTOS = 'eventos.gestion';

export const CLAVES = {
  EVENTO_PUBLICADO: 'evento.publicado',
  EVENTO_ACTUALIZADO: 'evento.actualizado',
  EVENTO_CANCELADO: 'evento.cancelado',
} as const;

export type TipoMensajeEvento = keyof typeof CLAVES;

export interface LocalidadPublicada {
  localidadId: string;
  nombre: string;
  precio: number;
  /** Lo que Boletería llama `aforo` de la localidad: cupos a la venta. */
  cantidad: number;
  orden: number;
}

export interface MensajeEvento {
  /** Id del mensaje: la entrega es "al menos una vez" y con él se descarta el repetido. */
  id: string;
  tipo: TipoMensajeEvento;
  versionContrato: 1;
  ocurridoEn: string;
  eventoId: string;
  /** Versión del evento: un mensaje con versión menor o igual a la ya aplicada se ignora. */
  versionEvento: number;
  evento: {
    nombre: string;
    descripcion: string | null;
    categoria: string;
    artista: string | null;
    imagenUrl: string | null;
    fechaInicio: string;
    fechaFin: string;
    aforoMaximo: number;
    permiteReventa: boolean;
    estado: string;
    lugar: string;
    ciudad: string;
  };
  localidades: LocalidadPublicada[];
  /** Solo en EVENTO_CANCELADO. */
  cancelacion?: { motivo: string; requiereDevolucion: boolean };
}

export function mensajeEvento(tipo: TipoMensajeEvento, evento: Evento, recinto: Recinto, requiereDevolucion = false): MensajeEvento {
  return {
    id: randomUUID(),
    tipo,
    versionContrato: 1,
    ocurridoEn: new Date().toISOString(),
    eventoId: evento.id,
    versionEvento: evento.version,
    evento: {
      nombre: evento.nombre,
      descripcion: evento.descripcion,
      categoria: evento.categoria,
      artista: evento.artista,
      imagenUrl: evento.imagenUrl,
      fechaInicio: evento.fechaInicio.toISOString(),
      fechaFin: evento.fechaFin.toISOString(),
      aforoMaximo: evento.aforoMaximo,
      permiteReventa: evento.permiteReventa,
      estado: evento.estado,
      lugar: recinto.nombre,
      ciudad: recinto.ciudad,
    },
    localidades: [...(evento.localidades ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({ localidadId: l.id, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad, orden: l.orden })),
    ...(tipo === 'EVENTO_CANCELADO'
      ? { cancelacion: { motivo: evento.motivoCancelacion ?? '', requiereDevolucion } }
      : {}),
  };
}
