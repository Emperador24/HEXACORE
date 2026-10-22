import { EstadoPedido } from '../../persistencia/entidades/pedido.entity';

export class DetalleCheckoutDto {
  productoId: string;
  nombreProducto: string;
  precioUnitario: string;
  cantidad: number;
}

/** Checkout con inventario reservado temporalmente, pendiente de pago y confirmación. */
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
  inventarioReservado: true;
  detalles: DetalleCheckoutDto[];
}
