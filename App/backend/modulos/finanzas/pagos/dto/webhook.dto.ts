import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { TipoOperacion } from '../contratos/tipo-operacion';
import { ResultadoCobro } from '../procesador-pagos';

/**
 * Lo que la pasarela manda al confirmar una operación.
 *
 * Solo resultados finales: la pasarela avisa cuando sabe qué pasó con el
 * dinero. `INDETERMINADO` es un estado de Pagos —"no supe la respuesta"—, no
 * algo que la pasarela pueda notificar.
 */
export class NotificacionPasarelaDto {
  @ApiProperty({ description: 'La misma clave con la que Pagos pidió la operación.' })
  @IsString()
  @Length(8, 128)
  claveIdempotencia: string;

  @ApiProperty({ enum: [TipoOperacion.COBRO, TipoOperacion.REEMBOLSO] })
  @IsIn([TipoOperacion.COBRO, TipoOperacion.REEMBOLSO])
  operacion: TipoOperacion;

  @ApiProperty({ enum: [ResultadoCobro.APROBADO, ResultadoCobro.RECHAZADO] })
  @IsIn([ResultadoCobro.APROBADO, ResultadoCobro.RECHAZADO])
  resultado: ResultadoCobro.APROBADO | ResultadoCobro.RECHAZADO;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^(?:pas|ree)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  referencia: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @IsIn(['Fondos insuficientes', 'No existe un cobro aprobado con esa referencia', 'El medio de pago no admite reembolsos', 'El reembolso supera lo cobrado'])
  motivo: string | null;
}
