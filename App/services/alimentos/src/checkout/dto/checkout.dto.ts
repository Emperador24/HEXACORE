import { ApiProperty } from '@nestjs/swagger';
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
  // Anotados a mano: son tipos literales (`null` y `true`) y Swagger no puede
  // inferirlos — al intentarlo los reporta como dependencia circular y tumba
  // el arranque. No se notaba cuando Pedidos era un servicio aparte, porque
  // aquel no publicaba documentación; en el Núcleo la publica Administración
  // y alcanza a todos los módulos.
  @ApiProperty({ type: String, nullable: true, example: null, description: 'Se emite al confirmar el pago (CU-012).' })
  codigoQr: null;

  @ApiProperty({ example: true, description: 'El inventario quedó reservado temporalmente.' })
  inventarioReservado: true;
  detalles: DetalleCheckoutDto[];
}
