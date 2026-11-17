import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const TIPOS_RECURSO = ['EQUIPO_SONIDO', 'ILUMINACION', 'ESCENARIO', 'GENERADOR', 'MOBILIARIO', 'CARPAS', 'OTRO'] as const;
export type TipoRecurso = (typeof TIPOS_RECURSO)[number];

/** Precondición 2: hace falta un catálogo de recursos para poder planificar. */
export class RegistrarRecursoDto {
  @ApiProperty({ example: 'Planta eléctrica 50kVA' })
  @IsString() @IsNotEmpty({ message: 'Indica el nombre del recurso.' }) @MaxLength(200)
  nombre: string;

  @ApiProperty({ enum: TIPOS_RECURSO })
  @IsIn(TIPOS_RECURSO, { message: `El tipo debe ser uno de: ${TIPOS_RECURSO.join(', ')}.` })
  tipo: TipoRecurso;

  @ApiProperty({ example: 4 })
  @IsInt() @Min(1) @Max(1_000_000)
  cantidadTotal: number;

  @ApiPropertyOptional({ example: 350000 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  costoUnitario?: number;
}

/** Precondición 1: iniciar o retomar la planificación de un evento. */
export class CrearPlanDto {
  @ApiPropertyOptional({ example: 20000000 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  presupuesto?: number;
}

/** Paso 3: seleccionar un recurso y la cantidad necesaria. */
export class AsignarRecursoDto {
  @ApiProperty() @IsUUID('all', { message: 'Indica el recurso.' })
  recursoId: string;

  @ApiProperty({ example: 2 })
  @IsInt() @Min(1) @Max(1_000_000)
  cantidad: number;
}

/** Paso 3: seleccionar un proveedor registrado (CU-030). */
export class AsignarProveedorDto {
  @ApiProperty() @IsUUID('all', { message: 'Indica el proveedor.' })
  proveedorId: string;

  @ApiPropertyOptional({ example: 1800000 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  costo?: number;
}

/** Paso 3: seleccionar personal disponible. */
export class AsignarPersonalDto {
  @ApiProperty() @IsUUID('all', { message: 'Indica el empleado.' })
  empleadoId: string;
}

/** CU-016A: si no hay disponibilidad de personal, se puede solicitar más. */
export class SolicitarPersonalAdicionalDto {
  @ApiProperty({ example: 'Entrada' })
  @IsString() @IsNotEmpty({ message: 'Indica el rol que hace falta.' }) @MaxLength(120)
  rol: string;

  @ApiProperty({ example: 3 })
  @IsInt() @Min(1) @Max(1000)
  cantidad: number;

  @ApiProperty({ example: 'El personal disponible no alcanza para cubrir las cuatro zonas' })
  @IsString() @IsNotEmpty({ message: 'Indica por qué hace falta.' }) @MaxLength(1000)
  motivo: string;
}

/** Paso 8: aprobar el plan. CU-016E exige confirmar si el costo supera el presupuesto. */
export class AprobarPlanDto {
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  confirmarSobrePresupuesto?: boolean;
}
