import { TOKEN_PAGO } from '../../../compartido/token-pago';
import { Matches as CoincideToken } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { TIPOS_VEHICULO, TipoVehiculo } from '../comun/vehiculos';

/** Placas colombianas y similares: letras y números, con o sin guion. Se guardan en mayúsculas y sin separadores. */
const PLACA = /^[A-Za-z0-9-]{4,10}$/;
const MENSAJE_PLACA = 'La placa debe tener entre 4 y 10 letras o números.';
/** El QR de una reserva (CU-021): `HXP-` y 16 caracteres. Se valida la forma; si existe, lo dice la base. */
const QR = /^HXP-[A-Z0-9]{16}$/i;
const MENSAJE_QR = 'El código no tiene la forma de un QR de parqueadero.';
const MENSAJE_TIPO = `tipoVehiculo debe ser ${TIPOS_VEHICULO.join(', ')}.`;

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

  /** CU-023: con qué empiezan los códigos de sus espacios (`N-01`…). Sin él, la inicial del nombre. */
  @ApiPropertyOptional({ example: 'N' })
  @IsOptional() @Matches(/^[A-Za-z0-9]{1,6}$/, { message: 'El prefijo lleva de 1 a 6 letras o números.' })
  prefijo?: string;
}

export class ActualizarZonaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) capacidad?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) orden?: number;
}

/**
 * CU-022, paso 1: lo que se presenta en el punto de control de ingreso, el QR
 * de la reserva o la placa (una de las dos). Si la placa tiene reserva pagada,
 * se usa la reserva aunque no traiga el QR. La reserva prepagada (CU-024A) la
 * determina el sistema, nunca quien registra.
 */
export class RegistrarIngresoDto {
  @ApiPropertyOptional({ example: 'ABC123' })
  @IsOptional() @Matches(PLACA, { message: MENSAJE_PLACA })
  placa?: string;

  @ApiPropertyOptional({ example: 'HXP-7K2M9Q4T8V3B6N1C' })
  @IsOptional() @Matches(QR, { message: MENSAJE_QR })
  codigoQr?: string;

  /** CU-023, entradas. Sin él, automóvil. */
  @ApiPropertyOptional({ enum: TIPOS_VEHICULO })
  @IsOptional() @IsIn(TIPOS_VEHICULO, { message: MENSAJE_TIPO })
  tipoVehiculo?: TipoVehiculo;

  /** Sin zona, el sistema usa la recomendada (CU-025, paso 7). */
  @ApiPropertyOptional() @IsOptional() @IsUUID('all', { message: 'zonaId debe ser una zona del evento.' })
  zonaId?: string;

  /** El espacio que pide el operador; si ya está tomado se asigna otro (CU-023B). Exige `zonaId`. */
  @ApiPropertyOptional({ example: 'A-07' }) @IsOptional() @IsString() @MaxLength(20)
  espacio?: string;
}

/** CU-022, pasos 5-9 y CU-024, paso 1: la salida, por QR o por placa. */
export class RegistrarSalidaDto {
  @ApiPropertyOptional({ example: 'ABC123' })
  @IsOptional() @Matches(PLACA, { message: MENSAJE_PLACA })
  placa?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(QR, { message: MENSAJE_QR })
  codigoQr?: string;
}

/** CU-022, infraestructura: lo que el punto de control registró sin red. */
export class RegistroLocalDto {
  /** Lo genera el dispositivo: reenviarlo no registra dos veces. */
  @ApiProperty() @IsUUID('all', { message: 'Cada registro necesita su id (uuid).' })
  id: string;

  @ApiProperty({ enum: ['INGRESO', 'SALIDA'] }) @IsIn(['INGRESO', 'SALIDA'], { message: 'tipo debe ser INGRESO o SALIDA.' })
  tipo: 'INGRESO' | 'SALIDA';

  @ApiPropertyOptional() @IsOptional() @Matches(PLACA, { message: MENSAJE_PLACA }) placa?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(QR, { message: MENSAJE_QR }) codigoQr?: string;
  @ApiPropertyOptional({ enum: TIPOS_VEHICULO }) @IsOptional() @IsIn(TIPOS_VEHICULO, { message: MENSAJE_TIPO }) tipoVehiculo?: TipoVehiculo;
  @ApiPropertyOptional() @IsOptional() @IsUUID() zonaId?: string;

  /** Cuándo pasó de verdad, según el reloj del dispositivo. */
  @ApiProperty() @IsDateString({}, { message: 'ocurridoEn debe ser una fecha ISO.' })
  ocurridoEn: string;
}

export class SincronizarDto {
  @ApiProperty({ type: [RegistroLocalDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => RegistroLocalDto)
  registros: RegistroLocalDto[];
}

/** CU-023: el organizador ajusta un espacio. */
export class ActualizarEspacioDto {
  @ApiPropertyOptional({ enum: TIPOS_VEHICULO }) @IsOptional() @IsIn(TIPOS_VEHICULO, { message: MENSAJE_TIPO }) tipo?: TipoVehiculo;
  /** Menor es más cerca de la entrada (paso 3). */
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000) prioridad?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
}

/** CU-021, pasos 3-4: el cliente elige zona y registra su vehículo. */
export class ReservarDto {
  @ApiProperty() @IsUUID('all', { message: 'zonaId debe ser una zona del evento.' })
  zonaId: string;

  @ApiProperty({ example: 'ABC123' }) @Matches(PLACA, { message: MENSAJE_PLACA })
  placa: string;

  @ApiPropertyOptional({ enum: TIPOS_VEHICULO }) @IsOptional() @IsIn(TIPOS_VEHICULO, { message: MENSAJE_TIPO })
  tipoVehiculo?: TipoVehiculo;

  /** Hora prevista de llegada; sin ella, el inicio del evento. */
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'llegada debe ser una fecha ISO.' })
  llegada?: string;
}

/** CU-021, paso 5. RNF-05: solo el token opaco de la pasarela, nunca datos de tarjeta. */
export class PagarReservaDto {
  @ApiProperty({ example: 'tok_ok_demo' }) @IsString() @Length(4, 200)
  @CoincideToken(TOKEN_PAGO, { message: 'Usa un token opaco emitido por la pasarela' })
  token: string;
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
