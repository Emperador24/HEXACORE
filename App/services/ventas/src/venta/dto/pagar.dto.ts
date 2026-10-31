import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

/**
 * Con qué se paga. Lo comparten comprar (CU-001) y revender (CU-006).
 *
 * Vivía en `reventa/dto/`, que era el módulo del CU-006. Al salir Postventa a
 * su propio servicio (ADR-14) se quedó aquí la mitad que la venta primaria usa
 * —cómo se paga— y Postventa se llevó la suya —el comprobante de la reventa—.
 * Es una duplicación consciente de treinta líneas de forma, no de reglas: cada
 * servicio valida la entrada de su propia API, que es lo que le permite
 * desplegarse sin esperar al otro.
 */
export const METODOS_PAGO = ['TARJETA', 'PSE'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

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
