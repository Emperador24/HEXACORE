import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CrearTurnoDto {
  @ApiProperty()
  @IsUUID()
  empleadoId: string;

  @ApiProperty({ example: 'evt-1' })
  @IsString()
  @IsNotEmpty()
  eventoId: string;

  @ApiProperty({ example: 'Puerta Norte' })
  @IsString()
  @IsNotEmpty()
  zona: string;

  @ApiProperty({ example: '2026-09-17T13:00:00.000Z' })
  @IsDateString()
  horaInicio: string;

  @ApiProperty({ example: '2026-09-17T21:00:00.000Z' })
  @IsDateString()
  horaFin: string;
}
