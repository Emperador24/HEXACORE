import { IsNotEmpty, IsString } from 'class-validator';

export class SolicitarCambioTurnoDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
