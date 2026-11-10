import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Lo que `preparar.ts` crea para la demostración y comparten los casos de uso. */
export interface DatosDemo {
  sufijo: string;
  recinto: { id: string; nombre: string; zonas: Record<string, string> };
  evento: { id: string; nombre: string };
  /** Evento de la cartelera de Boletería: la asignación de personal (CU-007) elige de ahí. */
  eventoCartelera: { id: string; nombre: string };
  cuentaEmpleado: string;
  empleados: { id: string; nombre: string; credencial: string }[];
}

export const ARCHIVO_DATOS = resolve(__dirname, '..', '.datos-demo.json');

export function datos(): DatosDemo {
  return JSON.parse(readFileSync(ARCHIVO_DATOS, 'utf8'));
}
