import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

/** Placas colombianas y similares: letras y números, con o sin guion. Se guardan en mayúsculas y sin separadores. */
const PLACA = /^[A-Za-z0-9-]{4,10}$/;

/** CU-024: la tarifa por hora que define el Administrador. */
export class DefinirTarifaDto {
  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'valorHora debe ser un número con hasta dos decimales.' })
  @Min(1) @Max(10_000_000)
  valorHora: number;

  @ApiPropertyOptional({ example: 'Ajuste de temporada' })
  @IsOptional() @IsString() @MaxLength(300)
  motivo?: string;
}

export class GuardarZonaDto {
  @ApiProperty({ example: 'Zona A · Norte' })
  @IsString() @IsNotEmpty({ message: 'La zona necesita un nombre.' }) @MaxLength(120)
  nombre: string;

  @ApiProperty({ example: 120 })
  @IsInt() @Min(1) @Max(100_000)
  capacidad: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt() @Min(0) @Max(1000)
  orden?: number;
}

export class ActualizarZonaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) capacidad?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) orden?: number;
}

/**
 * Ingreso de un vehículo. Es el mínimo que CU-024/025 necesitan para tener
 * hora de ingreso y zona; la lectura del QR de la reserva y la asignación del
 * espacio son CU-022/023, que envían aquí lo que resolvieron.
 */
export class RegistrarIngresoDto {
  @ApiProperty({ example: 'ABC123' })
  @Matches(PLACA, { message: 'La placa debe tener entre 4 y 10 letras o números.' })
  placa: string;

  /** Sin zona, el sistema usa la recomendada (CU-025, paso 7). */
  @ApiPropertyOptional() @IsOptional() @IsUUID('all', { message: 'zonaId debe ser una zona del evento.' })
  zonaId?: string;

  @ApiPropertyOptional({ example: 'A-07' }) @IsOptional() @IsString() @MaxLength(20)
  espacio?: string;

  /** CU-021: la reserva con la que llegó, si la hay. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() reservaId?: string;

  /** CU-024A: la reserva ya está pagada. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() prepagada?: boolean;
}

/** CU-024, paso 1: el personal registra la salida. */
export class RegistrarSalidaDto {
  @ApiProperty({ example: 'ABC123' })
  @Matches(PLACA, { message: 'La placa debe tener entre 4 y 10 letras o números.' })
  placa: string;
}

/** CU-025, pasos 6-8: redirigir los ingresos a otra zona. */
export class RedirigirDto {
  @ApiPropertyOptional({ description: 'Zona de la que se desvía; sin ella, se desvía todo lo nuevo.' })
  @IsOptional() @IsUUID() zonaOrigenId?: string;

  @ApiProperty() @IsUUID('all', { message: 'zonaDestinoId debe ser una zona del evento.' })
  zonaDestinoId: string;

  @ApiProperty({ example: 'La zona Norte está al 92 %' })
  @IsString() @IsNotEmpty({ message: 'Indica el motivo.' }) @MaxLength(500)
  motivo: string;
}

export class ResultadoRedireccionDto {
  @ApiProperty({ example: 'La zona Norte bajó al 70 %' })
  @IsString() @IsNotEmpty({ message: 'Describe el resultado.' }) @MaxLength(1000)
  resultado: string;

  /** Si con esto termina la redirección y vuelve la recomendación automática. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() terminar?: boolean;
}
