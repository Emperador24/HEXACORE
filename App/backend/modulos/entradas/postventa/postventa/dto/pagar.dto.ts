import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import { PublicacionReventa } from '../../persistencia/entidades/publicacion-reventa.entity';
import { TransaccionReventa } from '../../persistencia/entidades/transaccion-reventa.entity';

export const METODOS_PAGO = ['TARJETA', 'PSE'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

/** Paso 7 del CU-006: *"El comprador realiza el pago a través de la pasarela de pagos"*. */
export class PagarDto {
  @ApiProperty({ enum: METODOS_PAGO, example: 'TARJETA' })
  @IsIn([...METODOS_PAGO])
  metodoPago: MetodoPago;

  /**
   * Token del medio de pago emitido por la pasarela.
   *
   * **Aquí no llegan datos de tarjeta, y no es un detalle de implementación.**
   * RNF-05 exige *"campos de tarjeta persistidos en cualquier base de datos
   * propia: 0"* y que *"el cobro se delega íntegramente a la pasarela"*. El
   * cliente tokeniza contra la pasarela y este servicio solo reenvía el token:
   * así el número de tarjeta nunca pasa por aquí, ni siquiera en memoria.
   *
   * En desarrollo, el simulador decide el resultado según el prefijo del token
   * (`tok_ok`, `tok_rechazo`, `tok_timeout`, `tok_error`).
   */
  @ApiProperty({ description: 'Token opaco del medio de pago; nunca datos de tarjeta', example: 'tok_ok_demo' })
  @IsString()
  @Length(3, 200)
  token: string;
}

/** Resultado de la compra: lo que el CU-006 declara como SALIDAS. */
export class ResultadoCompraDto {
  @ApiProperty({ example: 'TXN-2026-000001' }) numeroTransaccion: string;
  @ApiProperty({ enum: ['APROBADA'] }) estado: string;

  @ApiProperty({ description: 'Salida 1 del CU-006: confirmación de la transferencia' })
  transferida: boolean;

  @ApiProperty({ description: 'Salida 2 del CU-006: nuevo código QR para el comprador' })
  codigoQr: string;

  @ApiProperty({ format: 'uuid' }) entradaId: string;
  @ApiProperty({ example: 'TCK-2026-000001' }) numeroTicket: string;
  @ApiProperty({ example: 'HEXACORE Fest 2026' }) eventoNombre: string;
  @ApiProperty({ example: 'General' }) localidadNombre: string;
  @ApiProperty({ example: 300000 }) precio: number;
  @ApiProperty({ description: 'Referencia del cobro en la pasarela, para conciliar' })
  referenciaPasarela: string;
}

/**
 * El comprobante de la compra.
 *
 * Los datos de la entrada salen de la publicación, que lleva su copia, y el QR
 * del valor que Postventa generó y Ventas aceptó. Ya no se lee la entrada:
 * es de Ventas, y pedírsela otra vez solo para rellenar esta respuesta
 * añadiría una llamada que puede fallar después de un cobro correcto.
 */
export function aResultadoCompraDto(
  transaccion: TransaccionReventa,
  publicacion: PublicacionReventa,
  eventoNombre: string,
  codigoQrNuevo: string,
): ResultadoCompraDto {
  return {
    numeroTransaccion: transaccion.numeroTransaccion,
    estado: transaccion.estado,
    transferida: true,
    codigoQr: codigoQrNuevo,
    entradaId: publicacion.entradaId,
    numeroTicket: publicacion.numeroTicket,
    eventoNombre,
    localidadNombre: publicacion.localidadNombre,
    precio: transaccion.precio,
    referenciaPasarela: transaccion.referenciaPasarela ?? '',
  };
}
