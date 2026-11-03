import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SolicitarCambioTurnoDto {
  @ApiProperty({ example: 'Cita médica urgente' })
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
