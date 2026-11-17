import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export const TIPOS_SERVICIO = ['CATERING', 'SONIDO', 'SEGURIDAD', 'ILUMINACION', 'TRANSPORTE', 'LIMPIEZA', 'OTRO'] as const;
export type TipoServicio = (typeof TIPOS_SERVICIO)[number];

/** Paso 3: el coordinador completa los datos del proveedor. */
export class RegistrarProveedorDto {
  @ApiProperty({ example: 'Sonidos del Valle S.A.S.' })
  @IsString() @IsNotEmpty({ message: 'Indica el nombre del proveedor.' }) @MaxLength(200)
  nombre: string;

  @ApiProperty({ enum: TIPOS_SERVICIO })
  @IsIn(TIPOS_SERVICIO, { message: `El tipo de servicio debe ser uno de: ${TIPOS_SERVICIO.join(', ')}.` })
  tipoServicio: TipoServicio;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  nombreContacto?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40)
  telefono?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  correo?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  direccion?: string;

  @ApiPropertyOptional({ example: 2500000 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  costoReferencia?: number;
}

export class ActualizarProveedorDto extends RegistrarProveedorDto {
  /** CU-030A: confirma explícitamente que entiende el impacto en eventos futuros ya planificados. */
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  confirmarImpacto?: boolean;
}

/** CU-030B: dar de baja exige confirmar si hay asignaciones activas. */
export class DarDeBajaProveedorDto {
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  confirmar?: boolean;
}
