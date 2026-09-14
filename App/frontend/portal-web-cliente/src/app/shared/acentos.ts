/**
 * Acentos que rotan por fila, iguales a `_rowAccents` de la app móvil
 * (app-movil/lib/main.dart). Cada tarjeta de una lista toma el siguiente color
 * del ciclo, así la lista se lee variada sin que el color signifique nada.
 */
export const ACENTOS = ['#ff3d7f', '#22d3ee', '#ffb020', '#3b5bff'] as const;

/** Color de acento que le toca a la posición `indice` de una lista. */
export function acento(indice: number): string {
  return ACENTOS[indice % ACENTOS.length];
}

/** Acentos con nombre, para los estados y elementos que sí significan algo. */
export const COLOR = {
  primario: '#2f6bff',
  rosa: '#ff3d7f',
  cian: '#22d3ee',
  indigo: '#3b5bff',
  ambar: '#ffb020',
  verde: '#34d399',
  rojo: '#ff5a5f'
} as const;
