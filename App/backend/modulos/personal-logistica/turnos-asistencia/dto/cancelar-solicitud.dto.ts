import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** CU-008B: el motivo de retirar la solicitud es opcional. */
export class CancelarSolicitudDto {
  @ApiPropertyOptional({ example: 'Ya resolví el compromiso' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo?: string;
}
