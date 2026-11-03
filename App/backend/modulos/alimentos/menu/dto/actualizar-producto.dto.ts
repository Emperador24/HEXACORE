import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ActualizarProductoDto {
  @ApiProperty({ description: 'Disponibilidad del producto para la venta' })
  @IsBoolean()
  activo: boolean;
}
