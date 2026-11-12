import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsInt, IsString, Length, Min } from 'class-validator';

export class CancelarPedidoDto {
  @IsInt() @Min(0) version: number;
  @IsString() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(3, 200) motivo: string;
  @IsBoolean() @Equals(true) confirmar: boolean;
}
