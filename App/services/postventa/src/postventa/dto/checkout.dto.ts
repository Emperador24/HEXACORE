import { ApiProperty } from '@nestjs/swagger';
import { EstadoTransaccion, TransaccionReventa } from '../../persistencia/entidades/transaccion-reventa.entity';
import { PublicacionMercadoDto } from './mercado.dto';

/**
 * Un checkout abierto: la publicación queda reservada para este comprador
 * mientras dure el bloqueo.
 */
export class CheckoutDto {
  @ApiProperty({ description: 'Identificador del checkout; es también el id de la transacción', format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'TXN-2026-000001' }) numeroTransaccion: string;
  @ApiProperty({ format: 'uuid' }) publicacionId: string;
  @ApiProperty({ enum: EstadoTransaccion }) estado: EstadoTransaccion;

  @ApiProperty({ description: 'Lo que se le cobrará al comprador', example: 300000 })
  precio: number;

  @ApiProperty({ description: 'Retención de la plataforma sobre el precio', example: 30000 })
  comision: number;

  @ApiProperty({ description: 'Lo que recibirá el vendedor al liquidarse (paso 13)', example: 270000 })
  netoVendedor: number;

  /**
   * Cuándo caduca la reserva.
   *
   * Se devuelve como instante absoluto y además en segundos restantes: lo
   * primero para que el cliente no dependa de que su reloj coincida con el del
   * servidor, lo segundo para poder pintar una cuenta atrás sin restar fechas.
   */
  @ApiProperty({ description: 'Instante en que el bloqueo caduca' })
  reservaHasta: string;

  @ApiProperty({ description: 'Segundos que quedan de reserva', example: 120 })
  segundosRestantes: number;

  @ApiProperty({ description: 'Qué se está comprando', type: PublicacionMercadoDto })
  publicacion: PublicacionMercadoDto;
}

export function aCheckoutDto(
  transaccion: TransaccionReventa,
  publicacion: PublicacionMercadoDto,
  restanteMs: number,
): CheckoutDto {
  return {
    id: transaccion.id,
    numeroTransaccion: transaccion.numeroTransaccion,
    publicacionId: transaccion.publicacionId,
    estado: transaccion.estado,
    precio: transaccion.precio,
    comision: transaccion.comision,
    netoVendedor: transaccion.netoVendedor,
    reservaHasta: new Date(Date.now() + restanteMs).toISOString(),
    segundosRestantes: Math.max(0, Math.floor(restanteMs / 1000)),
    publicacion,
  };
}
