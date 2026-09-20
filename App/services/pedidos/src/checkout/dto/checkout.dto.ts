import { EstadoPedido } from '../../persistencia/entidades/pedido.entity';

export class DetalleCheckoutDto {
  productoId: string;
  nombreProducto: string;
  precioUnitario: string;
  cantidad: number;
}

/** Selección pendiente de pago; no constituye una reserva de inventario. */
export class CheckoutDto {
  id: string;
  establecimientoId: string;
  estado: EstadoPedido;
  metodoEntrega: string;
  moneda: string;
  total: string;
  creadoEn: string;
  expiraEn: string;
  codigoQr: null;
  inventarioReservado: false;
  detalles: DetalleCheckoutDto[];
}
