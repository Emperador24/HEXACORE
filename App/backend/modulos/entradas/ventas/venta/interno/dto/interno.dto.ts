import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class EntradaIdDto {
  @ApiProperty()
  @IsUUID()
  entradaId: string;
}

export class TransferirDto {
  @ApiProperty()
  @IsUUID()
  entradaId: string;

  @ApiProperty()
  @IsUUID()
  compradorId: string;

  @ApiProperty()
  @IsUUID()
  vendedorId: string;

  @ApiProperty()
  @IsUUID()
  transaccionId: string;

  @ApiProperty({ description: 'El QR nuevo. Lo genera Postventa y lo escribe Ventas en el mismo UPDATE.' })
  @IsString()
  @Length(8, 64)
  codigoQrNuevo: string;
}

export class TransferenciaDto {
  @ApiProperty()
  transferida: boolean;

  @ApiProperty({ nullable: true, description: 'El QR que deja de valer. Para auditar.' })
  qrAnterior: string | null;
}

export class MarcarEnReventaDto {
  @ApiProperty()
  @IsUUID()
  entradaId: string;

  @ApiProperty({ description: 'Quién dice ser el dueño. Se comprueba en el mismo UPDATE.' })
  @IsUUID()
  propietarioId: string;
}
