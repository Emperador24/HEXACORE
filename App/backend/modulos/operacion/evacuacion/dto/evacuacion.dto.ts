import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const TIPOS_EMERGENCIA = [
  'INCENDIO', 'AMENAZA_SEGURIDAD', 'EMERGENCIA_MEDICA', 'FALLA_ESTRUCTURAL', 'INUNDACION', 'PREVENTIVA', 'OTRA',
] as const;
export type TipoEmergencia = (typeof TIPOS_EMERGENCIA)[number];

// --- Plan de evacuación del recinto (precondición 1) -------------------------

export class SalidaPlanDto {
  @ApiProperty({ example: 'Salida Norte' })
  @IsString() @IsNotEmpty({ message: 'Cada salida necesita un nombre.' }) @MaxLength(120)
  nombre: string;

  /** Personas por minuto que puede evacuar; sirve para avisar de una salida saturada (CU-010B). */
  @ApiPropertyOptional({ example: 120 })
  @IsOptional() @IsInt() @Min(1) @Max(100000)
  capacidadPorMinuto?: number;
}

export class RutaPlanDto {
  @ApiProperty() @IsUUID('all', { message: 'zonaId debe ser una zona del recinto.' })
  zonaId: string;

  /** Nombre de una de las salidas del mismo plan. */
  @ApiProperty({ example: 'Salida Norte' })
  @IsString() @IsNotEmpty() @MaxLength(120)
  salida: string;

  /** 1 es la ruta principal; las demás son alternativas (CU-010A/B). */
  @ApiProperty({ example: 1 })
  @IsInt() @Min(1) @Max(20)
  prioridad: number;

  @ApiPropertyOptional({ example: 'Bajar por la escalera B y seguir la señalización verde' })
  @IsOptional() @IsString() @MaxLength(500)
  descripcion?: string;
}

export class GuardarPlanDto {
  @ApiProperty({ type: [SalidaPlanDto] })
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SalidaPlanDto)
  salidas: SalidaPlanDto[];

  @ApiProperty({ type: [RutaPlanDto] })
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => RutaPlanDto)
  rutas: RutaPlanDto[];
}

// --- Protocolo ----------------------------------------------------------------

/** Paso 1: tipo, ubicación y nivel; CU-010C si el alcance es parcial. */
export class ActivarEvacuacionDto {
  @ApiProperty({ enum: TIPOS_EMERGENCIA })
  @IsIn(TIPOS_EMERGENCIA, { message: 'Tipo de emergencia desconocido.' })
  tipo: TipoEmergencia;

  @ApiProperty({ example: 'Cocina del restaurante, costado oriental' })
  @IsString() @IsNotEmpty({ message: 'Indica dónde es la emergencia.' }) @MaxLength(300)
  ubicacion: string;

  /** 1 local, 2 la zona y sus vecinas, 3 todo el recinto. */
  @ApiProperty({ minimum: 1, maximum: 3 })
  @IsInt() @Min(1) @Max(3)
  nivel: number;

  @ApiProperty({ enum: ['PARCIAL', 'TOTAL'] })
  @IsIn(['PARCIAL', 'TOTAL'])
  alcance: 'PARCIAL' | 'TOTAL';

  /** Zona donde está la emergencia. Obligatoria en una evacuación parcial. */
  @ApiPropertyOptional()
  @ValidateIf((dto: ActivarEvacuacionDto) => dto.alcance === 'PARCIAL' && !dto.zonasIds?.length)
  @IsUUID('all', { message: 'Una evacuación parcial necesita la zona afectada.' })
  zonaOrigenId?: string;

  /** Zonas que el supervisor añade a mano. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true })
  zonasIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  descripcion?: string;
}

/** Paso 10: lo que reporta el personal de una zona. */
export class ReporteZonaDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @IsInt() @Min(0) @Max(1000000)
  personasRestantes?: number;

  @ApiPropertyOptional({ enum: ['PENDIENTE', 'EN_CURSO', 'EVACUADA'] })
  @IsOptional() @IsIn(['PENDIENTE', 'EN_CURSO', 'EVACUADA'])
  estado?: 'PENDIENTE' | 'EN_CURSO' | 'EVACUADA';
}

/** CU-010B: el supervisor confirma la ruta alternativa de una zona. */
export class CambiarRutaDto {
  @ApiProperty() @IsUUID('all', { message: 'salidaId debe ser una salida del recinto.' })
  salidaId: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;
}

/** CU-010A: una salida deja de estar disponible (o vuelve a estarlo). */
export class BloqueoSalidaDto {
  @ApiProperty() @IsBoolean()
  bloqueada: boolean;

  @ApiPropertyOptional({ example: 'Humo en el pasillo' })
  @ValidateIf((dto: BloqueoSalidaDto) => dto.bloqueada)
  @IsString() @IsNotEmpty({ message: 'Indica por qué se bloquea la salida.' }) @MaxLength(500)
  motivo?: string;
}

/** CU-010D: escalar el nivel de la emergencia. */
export class CambiarNivelDto {
  @ApiProperty({ minimum: 2, maximum: 3 })
  @IsInt() @Min(2) @Max(3)
  nivel: number;

  @ApiProperty({ example: 'El fuego se extendió a la zona contigua' })
  @IsString() @IsNotEmpty({ message: 'Indica por qué se escala.' }) @MaxLength(500)
  motivo: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true })
  zonasIds?: string[];
}

/** Paso 12: el supervisor confirma que se evacuó. */
export class FinalizarEvacuacionDto {
  @ApiPropertyOptional({ example: 'Sin heridos; bomberos controlaron el foco' })
  @IsOptional() @IsString() @MaxLength(2000)
  observaciones?: string;
}
