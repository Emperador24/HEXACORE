import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CrearEmpleadoDto {
  @ApiProperty({ example: 'Luis Ramírez' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Entrada' })
  @IsString()
  @IsNotEmpty()
  rol: string;

  @ApiProperty({ example: 'personal@hexacore.com' })
  @IsString()
  @IsNotEmpty()
  credencial: string;
}
