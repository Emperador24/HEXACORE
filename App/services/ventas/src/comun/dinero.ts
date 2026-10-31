/** Reparto de un cobro de reventa entre la plataforma y el vendedor. */
export interface Reparto {
  /** Lo que paga el comprador: el precio publicado, sin recargos. */
  precio: number;
  /** Lo que retiene la plataforma. */
  comision: number;
  /** Lo que se le liquida al vendedor en el paso 13 del CU-006. */
  netoVendedor: number;
}

/**
 * Reparte el precio entre comisión y neto del vendedor.
 *
 * **Todo el cálculo se hace en centavos enteros.** Con números en coma
 * flotante, `precio - precio * 0.10` puede dar 269999.99999999994 para un
 * precio de 299999,99: al redondear cada parte por separado, la suma deja de
 * cuadrar con el total por un centavo.
 *
 * Eso no sería un detalle estético. La tabla `transacciones_reventa` tiene una
 * restricción `CHECK (precio = comision + neto_vendedor)`, así que un centavo
 * descuadrado **aborta la inserción** y tumba el checkout. Restar en vez de
 * calcular las dos partes por separado garantiza que sumen exactamente.
 */
export function repartir(precio: number, comisionPorcentaje: number): Reparto {
  const centavos = Math.round(precio * 100);
  const comisionCentavos = Math.round((centavos * comisionPorcentaje) / 100);
  // El neto es el resto, no otro redondeo: así comisión + neto == precio siempre.
  const netoCentavos = centavos - comisionCentavos;

  return {
    precio: centavos / 100,
    comision: comisionCentavos / 100,
    netoVendedor: netoCentavos / 100,
  };
}
