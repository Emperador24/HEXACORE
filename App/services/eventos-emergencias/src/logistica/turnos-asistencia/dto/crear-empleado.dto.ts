import { IsNotEmpty, IsString } from 'class-validator';

export class CrearEmpleadoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  rol: string;

  @IsString()
  @IsNotEmpty()
  credencial: string;
}
