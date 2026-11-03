export type TipoEventoPago = 'PAGO_APROBADO' | 'PAGO_RECHAZADO';

/**
 * Resultado de un cobro o un reembolso **confirmado por la pasarela** (ADR-15).
 *
 * El `id` es la clave de idempotencia más el resultado: el webhook puede llegar
 * repetido, y quien consume necesita algo con lo que descartar el duplicado.
 */
export interface EventoPago {
  id: string;
  tipo: TipoEventoPago;
  version: 1;
  ocurridoEn: string;
  claveIdempotencia: string;
  operacion: 'COBRO' | 'REEMBOLSO';
  solicitante: string;
  monto: number;
  moneda: string;
  referencia: string | null;
  motivo: string | null;
}
