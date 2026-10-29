import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class MarcarUsadaDto {
  @ApiProperty({ description: 'El código que se escaneó en la puerta.' })
  @IsString()
  @Length(8, 64)
  codigoQr: string;

  @ApiProperty({ description: 'Evento al que corresponde la puerta.' })
  @IsUUID()
  eventoId: string;
}

export class RevertirUsoDto {
  @ApiProperty()
  @IsUUID()
  entradaId: string;
}

export class EntradaValidadaDto {
  @ApiProperty()
  entradaId: string;

  @ApiProperty()
  numeroTicket: string;

  @ApiProperty()
  localidadNombre: string;

  @ApiProperty()
  propietarioId: string;
}
