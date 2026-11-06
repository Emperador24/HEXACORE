/**
 * Acentos que rotan por fila, iguales a `ACENTOS` del portal de clientes y a
 * `_rowAccents` de la app móvil. El color varía la lista; no significa nada.
 */
export const ACENTOS = ['#ff3d7f', '#22d3ee', '#ffb020', '#3b5bff'] as const;

export function acento(indice: number): string {
  return ACENTOS[indice % ACENTOS.length];
}

/** Dos iniciales para el avatar de una persona. */
export function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}
