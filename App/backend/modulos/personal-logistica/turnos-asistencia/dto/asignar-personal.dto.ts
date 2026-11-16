import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class AsignarPersonalDto {
  @ApiProperty()
  @IsUUID()
  empleadoId: string;

  @ApiProperty({ example: '2026-09-20T13:00:00.000Z' })
  @IsDateString()
  horaInicio: string;

  @ApiProperty({ example: '2026-09-20T21:00:00.000Z' })
  @IsDateString()
  horaFin: string;
}
