import { ReglasVenta } from '../config/configuracion';
import { CodigoPromocional } from '../persistencia/entidades/codigo-promocional.entity';


const aCentavos = (monto: number): number => Math.round(monto * 100);
const aPesos = (centavos: number): number => centavos / 100;

export interface Importes {
  subtotal: number;
  descuento: number;
  total: number;
}

// subtotal, descuento y total
export function calcularImportes(precioUnitario: number, cantidad: number, porcentajeDescuento = 0): Importes {
  const subtotal = aCentavos(precioUnitario) * cantidad;
  // Se redondeo hacia abajo
  const descuento = Math.floor((subtotal * porcentajeDescuento) / 100);
  return { subtotal: aPesos(subtotal), descuento: aPesos(descuento), total: aPesos(subtotal - descuento) };
}

/**
 * el total no siempre se divide exacto, el exedente va a la primera entrada, de modo
 * que la suma de las partes es siempre el total cobrado.
 * evita que en caso de un rembolso se devuelva mas de lo que se cobro
 */
export function repartirPorEntrada(total: number, cantidad: number): number[] {
  const centavos = aCentavos(total);
  const base = Math.floor(centavos / cantidad);
  const resto = centavos - base * cantidad;
  return Array.from({ length: cantidad }, (_, i) => aPesos(base + (i < resto ? 1 : 0)));
}

// monto a reembolsar
export function montoReembolso(preciosPagados: number[], porcentaje: number): number {
  const pagado = preciosPagados.reduce((suma, precio) => suma + aCentavos(precio), 0);
  return aPesos(Math.floor((pagado * porcentaje) / 100));
}

export interface Politica {
  //Porcentaje a reembolsar
  porcentaje: number | null;
  tramo: 'TOTAL' | 'PARCIAL' | 'FUERA_DE_PLAZO' | 'EVENTO_CANCELADO';
}

// Verificar condiciones de cancelación 
// Si el organizador cancelo el evento, se devuelve todo
export function politicaCancelacion(
  fechaEvento: Date,
  eventoCancelado: boolean,
  ahora: Date,
  reglas: ReglasVenta,
): Politica {
  if (eventoCancelado) return { porcentaje: 100, tramo: 'EVENTO_CANCELADO' };

  const horasQueFaltan = (fechaEvento.getTime() - ahora.getTime()) / 3_600_000;
  if (horasQueFaltan >= reglas.cancelacionTotalDias * 24) return { porcentaje: 100, tramo: 'TOTAL' };
  if (horasQueFaltan >= reglas.cancelacionParcialHoras) {
    return { porcentaje: reglas.cancelacionParcialPorcentaje, tramo: 'PARCIAL' };
  }
  return { porcentaje: null, tramo: 'FUERA_DE_PLAZO' };
}

// Por que un cupon no sirve
export type MotivoCuponNoValido =
  | { tipo: 'INVALIDO'; motivo: string }
  | { tipo: 'NO_APLICA' }
  | { tipo: 'AGOTADO' };

export function evaluarCupon(
  cupon: CodigoPromocional | null,
  compra: { eventoId: string; localidadId: string },
  ahora: Date,
): MotivoCuponNoValido | null {
  // que exista y este vigente CU-004C
  if (!cupon?.activo) return { tipo: 'INVALIDO', motivo: 'no existe' };
  if (ahora < cupon.vigenteDesde) return { tipo: 'INVALIDO', motivo: 'todavía no está vigente' };
  if (ahora >= cupon.vigenteHasta) return { tipo: 'INVALIDO', motivo: 'ya venció' };
  // verificar que aplique al evento y localidad CU-004A
  if (cupon.eventoId && cupon.eventoId !== compra.eventoId) return { tipo: 'NO_APLICA' };
  if (cupon.localidadId && cupon.localidadId !== compra.localidadId) return { tipo: 'NO_APLICA' };
  // verificar usos
  if (cupon.limiteUsos !== null && cupon.usos >= cupon.limiteUsos) return { tipo: 'AGOTADO' };
  return null;
}

//codigp
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}
