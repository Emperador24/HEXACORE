import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Paso 3: un tipo de entrada con su precio y su cantidad, opcionalmente en una zona del recinto. */
export class LocalidadDto {
  /** Al editar, el id de la localidad que se conserva; sin él, es nueva. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'General' })
  @IsString()
  @IsNotEmpty({ message: 'Cada tipo de entrada necesita un nombre.' })
  @MaxLength(120)
  nombre: string;

  @ApiProperty({ example: 120000 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio debe ser un número con máximo dos decimales.' })
  @Min(0, { message: 'El precio no puede ser negativo.' })
  @Max(9_999_999_999)
  precio: number;

  @ApiProperty({ example: 500 })
  @IsInt({ message: 'La cantidad debe ser un número entero.' })
  @Min(1, { message: 'Cada tipo de entrada debe tener al menos un cupo.' })
  cantidad: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Zona del recinto que ocupa' })
  @IsOptional()
  @IsUUID()
  zonaRecintoId?: string;
}

/** Pasos 2-3: la información del evento. Crear y editar usan el mismo formulario. */
export class GuardarEventoDto {
  @ApiProperty({ example: 'Noche de Rock Nacional' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(200)
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descripcion?: string;

  @ApiProperty({ example: 'Conciertos' })
  @IsString()
  @IsNotEmpty({ message: 'La categoría es obligatoria.' })
  @MaxLength(60)
  categoria: string;

  @ApiPropertyOptional({ example: 'Aterciopelados' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  artista?: string;

  @ApiPropertyOptional({ example: 'https://picsum.photos/seed/rock/600/800' })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true }, { message: 'La imagen debe ser una URL http(s).' })
  @MaxLength(500)
  imagenUrl?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Elige un recinto.' })
  recintoId: string;

  @ApiProperty({ example: '2026-12-12T00:00:00.000Z' })
  @IsISO8601({ strict: true }, { message: 'La fecha de inicio no es válida.' })
  fechaInicio: string;

  @ApiProperty({ example: '2026-12-12T04:00:00.000Z' })
  @IsISO8601({ strict: true }, { message: 'La fecha de fin no es válida.' })
  fechaFin: string;

  /** Sin valor, toma la capacidad del recinto. */
  @ApiPropertyOptional({ example: 8000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  aforoMaximo?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  permiteReventa?: boolean;

  @ApiProperty({ type: [LocalidadDto] })
  @ValidateNested({ each: true })
  @Type(() => LocalidadDto)
  @ArrayMinSize(1, { message: 'Define al menos un tipo de entrada.' })
  @ArrayMaxSize(30)
  localidades: LocalidadDto[];

  /** Al editar: la versión que se tenía en pantalla (control de concurrencia). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  version?: number;
}

export class VersionDto {
  @ApiProperty({ description: 'Versión del evento que se tenía en pantalla' })
  @IsInt({ message: 'Falta la versión del evento.' })
  version: number;
}

/** CU-026D: cancelar exige motivo; queda en el historial y viaja en el mensaje de cancelación. */
export class CancelarEventoDto extends VersionDto {
  @ApiProperty({ example: 'El artista canceló la gira' })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo de la cancelación.' })
  @MaxLength(500)
  motivo: string;
}
