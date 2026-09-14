import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CrearTurnoDto {
  @IsUUID()
  empleadoId: string;

  @IsString()
  @IsNotEmpty()
  eventoId: string;

  @IsString()
  @IsNotEmpty()
  zona: string;

  @IsDateString()
  horaInicio: string;

  @IsDateString()
  horaFin: string;
}
