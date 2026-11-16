import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CrearZonaEventoDto {
  @ApiProperty({ example: 'evt-1' })
  @IsString()
  @IsNotEmpty()
  eventoId: string;

  @ApiProperty({ example: 'Puerta Norte' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Entrada' })
  @IsString()
  @IsNotEmpty()
  rolRequerido: string;

  @ApiProperty({ example: 3, description: 'Cuántas personas con ese rol necesita la zona.' })
  @IsInt()
  @Min(1)
  personalRequerido: number;
}
