import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

/** Pasos 1-2 del CU-002: el QR escaneado en un punto de acceso de un evento. */
export class ValidarQrDto {
  @ApiProperty({ format: 'uuid', description: 'Evento en cuya puerta se escanea: un QR de otro evento no vale' })
  @IsUUID()
  eventoId: string;

  @ApiProperty({ example: 'HXC-QR-000001' })
  @IsString()
  @Length(6, 64)
  codigoQr: string;

  @ApiPropertyOptional({ example: 'Puerta 3' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  puntoAcceso?: string;
}

/** Salida del CU-002: *"Mensaje de ingreso autorizado"*, con lo que el personal necesita para el paso 9. */
export class IngresoAutorizadoDto {
  @ApiProperty({ example: true }) autorizado: boolean;
  @ApiProperty({ example: 'Ingreso autorizado' }) mensaje: string;
  @ApiProperty({ example: 'TCK-2026-001000' }) numeroTicket: string;
  @ApiProperty({ example: 'Palco VIP' }) localidadNombre: string;
  @ApiProperty() eventoNombre: string;
  @ApiProperty({ description: 'Post-condición 1: hora de acceso registrada' }) registradoEn: string;
  @ApiProperty({ description: 'Post-condición 2: aforo actualizado' }) asistentes: number;
  @ApiProperty({ nullable: true, type: Number }) aforoMaximo: number | null;
}

/** Un QR en la caché del dispositivo (CU-002E). */
export class QrCacheDto {
  @ApiProperty({ description: 'SHA-256 del código, en hexadecimal. El código en sí no viaja.' }) hash: string;
  @ApiProperty() numeroTicket: string;
  @ApiProperty() localidadNombre: string;
}

export class CacheQrDto {
  @ApiProperty({ format: 'uuid' }) eventoId: string;
  @ApiProperty() generadaEn: string;
  @ApiProperty({ type: [QrCacheDto], description: 'Solo las entradas que hoy podrían ingresar' }) validos: QrCacheDto[];
}

export class IngresoOfflineDto {
  @ApiProperty({ example: 'HXC-QR-000001' })
  @IsString()
  @Length(6, 64)
  codigoQr: string;

  @ApiProperty({ description: 'Cuándo se escaneó de verdad, sin conexión' })
  @IsISO8601({ strict: true })
  escaneadoEn: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 60)
  puntoAcceso?: string;
}

/** CU-002E: *"sincroniza el registro de ingreso al recuperar la conexión"*. */
export class SincronizarIngresosDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventoId: string;

  @ApiProperty({ type: [IngresoOfflineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => IngresoOfflineDto)
  ingresos: IngresoOfflineDto[];
}

export class ResultadoSincronizacionDto {
  @ApiProperty() codigoQr: string;
  @ApiProperty({
    enum: ['REGISTRADO', 'CU-002A', 'CU-002B', 'CU-002D'],
    description: 'Lo que no sea REGISTRADO es un conflicto que el personal debe revisar',
  })
  resultado: string;
  @ApiProperty() mensaje: string;
}

export class SincronizacionDto {
  @ApiProperty() registrados: number;
  @ApiProperty() conflictos: number;
  @ApiProperty({ type: [ResultadoSincronizacionDto] }) resultados: ResultadoSincronizacionDto[];
}
