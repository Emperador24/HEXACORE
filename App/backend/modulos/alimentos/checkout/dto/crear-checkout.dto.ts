import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class ProductoCheckoutDto {
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  productoId: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad: number;
}

export class CrearCheckoutDto {
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  eventoId: string;

  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  establecimientoId: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  metodoEntrega: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductoCheckoutDto)
  productos: ProductoCheckoutDto[];
}
