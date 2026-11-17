import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

export const MODULOS_CONCILIABLES = ['entradas', 'alimentos', 'parqueaderos'] as const;
export type ModuloConciliable = (typeof MODULOS_CONCILIABLES)[number];

/** Paso 1-2: rango de fechas y módulo a conciliar. */
export class SolicitarConciliacionDto {
  @ApiProperty({ example: '2026-11-01T00:00:00Z' })
  @IsISO8601()
  desde: string;

  @ApiProperty({ example: '2026-11-30T23:59:59Z' })
  @IsISO8601()
  hasta: string;

  @ApiPropertyOptional({ enum: MODULOS_CONCILIABLES })
  @IsOptional() @IsIn(MODULOS_CONCILIABLES, { message: `El módulo debe ser uno de: ${MODULOS_CONCILIABLES.join(', ')}.` })
  modulo?: ModuloConciliable;
}

/** Paso 7: aprobar un reembolso manual para una transacción con diferencia. */
export class AprobarReembolsoDto {
  @ApiProperty() @IsUUID('all', { message: 'Indica el ítem de conciliación con la diferencia.' })
  itemId: string;

  @ApiProperty({ example: 45000 })
  @IsNumber() @IsPositive()
  monto: number;

  @ApiProperty({ example: 'La pasarela reportó un cobro duplicado por error de red del cliente' })
  @IsString() @IsNotEmpty({ message: 'Indica la justificación del reembolso.' }) @MaxLength(1000)
  justificacion: string;
}
