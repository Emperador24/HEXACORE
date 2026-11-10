import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
export class OperacionPreparacionDto {
  @IsIn(['INICIAR', 'RETRASAR', 'LISTO', 'INCIDENCIA', 'RESOLVER_INCIDENCIA'])
  accion: 'INICIAR' | 'RETRASAR' | 'LISTO' | 'INCIDENCIA' | 'RESOLVER_INCIDENCIA';
  @IsInt() @Min(0) @Max(2147483646) version: number;
  @ValidateIf((_dto, valor) => valor !== undefined) @IsInt() @Min(1) @Max(240) minutos?: number;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().normalize('NFC') : value)
  @IsString() @Length(3, 1000) motivo?: string;
  @IsOptional() @IsUUID() productoId?: string;
  @IsOptional() @IsUUID() incidenciaId?: string;
}
