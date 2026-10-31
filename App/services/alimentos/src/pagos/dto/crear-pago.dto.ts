import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CrearPagoDto {
  @ApiProperty({ description: 'Token opaco de la pasarela; nunca datos de tarjeta', writeOnly: true })
  @IsString()
  @Matches(/\S/)
  @MaxLength(2048)
  tokenPago: string;
}
