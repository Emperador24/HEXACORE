import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TipoOperacion } from '../../persistencia/entidades/transaccion-pago.entity';
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
  referencia: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  motivo: string | null;
}
