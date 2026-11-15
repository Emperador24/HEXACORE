import { strict as assert } from 'node:assert';

export interface ErrorEsperado {
  desde: number;
  hasta: number;
  patron: RegExp;
  cantidad: number;
}

export const sinColores = (texto: string): string => texto.replace(/\u001b\[[0-9;]*m/g, '');

/** Mantiene los crudos intactos; solo acredita líneas exactas en una ventana declarada. */
export function sinErroresEsperados(salida: string, esperados: ErrorEsperado[]): string {
  const vistos = esperados.map(() => 0);
  let posicion = 0;
  const resultado = sinColores(salida).split('\n').map((linea) => {
    const inicio = posicion;
    posicion += linea.length + 1;
    const i = esperados.findIndex((e) => inicio >= e.desde && inicio + linea.length <= e.hasta && e.patron.test(linea));
    if (i === -1) return linea;
    vistos[i]++;
    return '';
  }).join('\n');
  esperados.forEach((e, i) => assert.equal(vistos[i], e.cantidad, 'Cantidad exacta de errores esperados en su ventana'));
  return resultado;
}
