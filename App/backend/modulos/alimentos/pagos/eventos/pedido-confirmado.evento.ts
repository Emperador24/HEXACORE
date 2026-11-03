/** Contrato mínimo para recibir el pedido en el establecimiento. El tipo viaja en la propiedad AMQP type. */
export interface PedidoConfirmado {
  pedidoId: string;
  establecimientoId: string;
  clienteId: string;
  total: string;
  moneda: string;
  metodoEntrega: string;
  puntoEntrega: string;
  productos: { productoId: string; nombreProducto: string; cantidad: number; precioUnitario: string }[];
  confirmadoEn: string;
}

// Mismo patrón topic/cola durable que reventa; sin consumidores ni recuperación de eventos en este paso.
export const EXCHANGE_PEDIDOS = 'pedidos.eventos';
export const COLA_ESTABLECIMIENTOS = 'pedidos.establecimientos';
export const CLAVE_PEDIDO_CONFIRMADO = 'pedido.confirmado';
export const EVENTO_PEDIDO_CONFIRMADO = 'PEDIDO_CONFIRMADO';
