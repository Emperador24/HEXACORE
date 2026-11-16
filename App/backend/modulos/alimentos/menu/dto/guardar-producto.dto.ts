import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, NotEquals } from 'class-validator';
const texto = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ').normalize('NFC') : value;

export class GuardarProductoDto {
  @Transform(texto) @IsString() @Length(2, 200) nombre: string;
  @Transform(texto) @IsOptional() @IsString() @MaxLength(5000) descripcion?: string;
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, { message: 'El precio debe ser texto decimal positivo con máximo dos decimales.' }) precio: string;
  @Transform(({ value }) => Array.isArray(value) ? value.map(v => texto({ value: v })) : value)
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true }) @Length(1, 100, { each: true })
  restriccionesAlimentarias: string[];
  @IsBoolean() activo: boolean;
}
export class RegistrarProductoDto extends GuardarProductoDto {
  @IsInt() @Min(0) @Max(2147483647) cantidadInicial: number;
}
export class AjustarInventarioDto {
  @IsInt() @Min(-2147483647) @Max(2147483647) @NotEquals(0) delta: number;
  @Transform(texto) @IsString() @Length(3, 500) motivo: string;
}

export function precioNormalizado(precio: string): string {
  const [entero, fraccion = ''] = precio.split('.');
  return `${entero}.${fraccion.padEnd(2, '0')}`;
}
