import { EstadoEvento } from '../core/models';
import { Tono } from '../compartido/formato';

export function estadoEvento(estado: EstadoEvento): { texto: string; tono: Tono } {
  switch (estado) {
    case EstadoEvento.PUBLICADO: return { texto: 'Publicado', tono: 'ok' };
    case EstadoEvento.CANCELADO: return { texto: 'Cancelado', tono: 'peligro' };
    default: return { texto: 'Borrador', tono: 'neutro' };
  }
}

const ACCIONES: Record<string, string> = {
  CREADO: 'Creado como borrador',
  EDITADO: 'Editado',
  PUBLICADO: 'Publicado',
  CANCELADO: 'Cancelado',
  ELIMINADO: 'Eliminado',
  IMPORTADO: 'Importado de la demostración'
};

export function etiquetaHistorial(accion: string): string {
  return ACCIONES[accion] ?? accion;
}

const CAMPOS: Record<string, string> = {
  nombre: 'nombre', descripcion: 'descripción', categoria: 'categoría', artista: 'artista', imagenUrl: 'imagen',
  recintoId: 'recinto', fechaInicio: 'inicio', fechaFin: 'fin', aforoMaximo: 'aforo máximo',
  permiteReventa: 'reventa', localidades: 'tipos de entrada', motivo: 'motivo'
};

/** Qué cambió en una versión, en una línea. */
export function resumenCambios(cambios: Record<string, unknown>): string {
  return Object.keys(cambios).filter((c) => c !== 'origen').map((c) => {
    if (c === 'motivo') return `Motivo: ${cambios[c]}`;
    return CAMPOS[c] ?? c;
  }).join(', ');
}

export const CATEGORIAS = ['Conciertos', 'Festivales', 'Teatro', 'Deportes', 'Ferias', 'Gastronomía', 'Conferencias', 'Familiar'];
