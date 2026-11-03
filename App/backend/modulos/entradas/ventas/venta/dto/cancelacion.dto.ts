import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { EstadoCancelacion } from '../../persistencia/entidades/cancelacion.entity';

/**
 * Qué entradas cancelar. Sin `entradaIds`, todas las de la compra; con
 * `entradaIds`, solo esas (CU-003B).
 */
export class CotizarCancelacionDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Vacío o ausente = todas las de la compra' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  entradaIds?: string[];
}

/** Pasos 1 y 5 del CU-003: el motivo y la confirmación del monto informado. */
export class CancelarCompraDto extends CotizarCancelacionDto {
  @ApiProperty({ example: 'No puedo asistir', description: 'Paso 1: el motivo de la cancelación' })
  @IsString()
  @Length(3, 500)
  motivo: string;

  @ApiProperty({
    example: 360000,
    description: 'Paso 5: el monto que el usuario vio en la cotización y acepta. Si cambió, se rechaza.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoAceptado: number;
}

export class EntradaRechazadaDto {
  @ApiProperty({ format: 'uuid' }) entradaId: string;
  @ApiProperty({ example: 'La entrada ya se usó para ingresar al evento (CU-003D)' }) motivo: string;
}

/** Pasos 2-4 del CU-003 y CU-003A: lo que se devolvería, antes de confirmar. */
export class CotizacionCancelacionDto {
  @ApiProperty({ type: [String], format: 'uuid' }) entradasCancelables: string[];
  @ApiProperty({ type: [EntradaRechazadaDto], description: 'CU-003D: las que no se pueden cancelar y por qué' })
  entradasRechazadas: EntradaRechazadaDto[];

  @ApiProperty({ description: 'Lo que se pagó por las entradas cancelables' }) montoPagado: number;
  @ApiProperty({ description: '100 = total; menos = parcial (CU-003A)' }) porcentajeReembolso: number;
  @ApiProperty() montoReembolso: number;
  @ApiProperty({ description: 'CU-003A: si el reembolso es parcial' }) parcial: boolean;
  @ApiProperty({ enum: ['TOTAL', 'PARCIAL', 'EVENTO_CANCELADO'] }) tramo: string;
  @ApiProperty({ description: 'Mensaje listo para mostrar' }) mensaje: string;
}

export class CancelacionDto extends CotizacionCancelacionDto {
  @ApiProperty({ format: 'uuid' }) cancelacionId: string;
  @ApiProperty({ enum: EstadoCancelacion }) estado: EstadoCancelacion;
  @ApiProperty({ nullable: true, type: String }) referenciaReembolso: string | null;
}
