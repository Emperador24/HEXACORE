import { TOKEN_PAGO } from '../../../../compartido/token-pago';
import { Matches as CoincideToken } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CrearPagoDto {
  @ApiProperty({ description: 'Token opaco de la pasarela; nunca datos de tarjeta', writeOnly: true })
  @IsString()
  @Matches(/\S/)
  @MaxLength(2048)
  @CoincideToken(TOKEN_PAGO, { message: 'Usa un token opaco emitido por la pasarela' })
  tokenPago: string;
}
