import { ApiProperty } from '@nestjs/swagger';
import { EstadoPedido, Pedido } from '../../persistencia/entidades/pedido.entity';
import { EstadoTransaccionPedido, TransaccionPedido } from '../../persistencia/entidades/transaccion-pedido.entity';

export class PagoDto {
  @ApiProperty({ format: 'uuid' }) pedidoId: string;
  @ApiProperty({ format: 'uuid' }) transaccionId: string;
  @ApiProperty({ enum: EstadoTransaccionPedido }) estadoPago: EstadoTransaccionPedido;
  @ApiProperty({ enum: EstadoPedido }) estadoPedido: EstadoPedido;
  @ApiProperty() monto: string;
  @ApiProperty() moneda: string;
  @ApiProperty({ nullable: true, type: String }) referenciaPasarela: string | null;
  @ApiProperty() codigo: string;
  @ApiProperty() compraConfirmada: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'Valor opaco del QR del pedido confirmado, para renderizar en el cliente' })
  codigoQr: string | null;
}

export function aPagoDto(pedido: Pedido, intento: TransaccionPedido): PagoDto {
  return {
    pedidoId: pedido.id, transaccionId: intento.id, estadoPago: intento.estado,
    estadoPedido: pedido.estado, monto: intento.monto, moneda: intento.moneda,
    referenciaPasarela: intento.referenciaPasarela,
    codigo: intento.estado === EstadoTransaccionPedido.FALLIDA
      ? intento.motivo === 'PASARELA_TIMEOUT' ? 'PASARELA_TIMEOUT' : 'PAGO_INCIERTO'
      : `PAGO_${intento.estado}`,
    compraConfirmada: pedido.estado === EstadoPedido.CONFIRMADO,
    codigoQr: pedido.codigoQr,
  };
}
