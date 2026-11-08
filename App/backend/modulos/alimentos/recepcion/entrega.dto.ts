import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
const codigo = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;
export class PrevalidarEntregaDto {
  @Transform(codigo) @IsString() @Matches(/^[a-f0-9]{64}$/) codigoQr: string;
}
export class ConfirmarEntregaDto {
  @IsUUID() pedidoId: string;
  @IsInt() @Min(0) @Max(2147483646) version: number;
  @IsString() @Matches(/^[a-f0-9]{64}$/) puntoRevision: string;
  // Ausente solo permite recuperar una operación YA confirmada; nunca entregar.
  @ValidateIf((_o, valor) => valor !== undefined)
  @Transform(codigo) @IsString() @Matches(/^[a-f0-9]{64}$/) codigoQr?: string;
}
