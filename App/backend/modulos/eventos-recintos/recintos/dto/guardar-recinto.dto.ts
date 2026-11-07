import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

/** Paso 3: una zona con su capacidad y, si se dibujó, su rectángulo en el plano (en %). */
export class ZonaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Al editar, la zona que se conserva' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'VIP' })
  @IsString()
  @IsNotEmpty({ message: 'Cada zona necesita un nombre.' })
  @MaxLength(120)
  nombre: string;

  @ApiProperty({ example: 400 })
  @IsInt({ message: 'La capacidad de una zona debe ser un número entero.' })
  @Min(1, { message: 'Cada zona debe admitir al menos una persona.' })
  capacidad: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) x?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) y?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(100) ancho?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(100) alto?: number;

  @ApiPropertyOptional({ example: '#ff3d7f' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'El color debe ser hexadecimal, p. ej. #ff3d7f.' })
  color?: string;
}

/** Pasos 2-3: datos generales y zonas. Crear y editar usan el mismo formulario. */
export class GuardarRecintoDto {
  @ApiProperty({ example: 'Movistar Arena' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(200)
  nombre: string;

  @ApiProperty({ example: 'Bogotá' })
  @IsString()
  @IsNotEmpty({ message: 'La ciudad es obligatoria.' })
  @MaxLength(120)
  ciudad: string;

  @ApiPropertyOptional({ example: 'Diagonal 61C # 26-36' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @ApiProperty({ example: 14000 })
  @IsInt({ message: 'La capacidad total debe ser un número entero.' })
  @Min(1, { message: 'La capacidad total debe ser mayor que cero.' })
  @Max(500_000)
  capacidad: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiProperty({ type: [ZonaDto] })
  @ValidateNested({ each: true })
  @Type(() => ZonaDto)
  @ArrayMaxSize(50)
  zonas: ZonaDto[];

  /** CU-029B: el organizador ya vio la advertencia de eventos activos y confirma. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  confirmarImpacto?: boolean;
}
