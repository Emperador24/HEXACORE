import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** CU-007 paso 3: actualizar la ficha. Solo cambia lo que se envía. */
export class ActualizarEmpleadoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rol?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  credencial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{5,20}$/, { message: 'El documento debe tener entre 5 y 20 letras, números o guiones.' })
  documento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido.' })
  correo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\+?[0-9 ]{7,20}$/, { message: 'El teléfono solo admite números, espacios y un + inicial.' })
  telefono?: string;
}
