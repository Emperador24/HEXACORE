import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

/** CU-027A: *"si el usuario olvida su contraseña…"*. */
export class SolicitarRecuperacionDto {
  @ApiProperty({ example: 'ana@hexacore.com', maxLength: 254 })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  email: string;
}

/** CU-027A: se usa el enlace recibido para elegir una contraseña nueva. */
export class RestablecerDto {
  @ApiProperty({ description: 'El token que viajaba en el enlace del correo.' })
  @Length(20, 200, { message: 'El enlace no es válido' })
  @IsString({ message: 'El enlace no es válido' })
  token: string;

  @ApiProperty({
    example: 'otra frase de paso larga',
    description: 'Misma política que en el registro (DECISIONES.md §2).',
  })
  // La política completa vive en `problemaDeContrasena` (DECISIONES.md §9).
  @IsNotEmpty({ message: 'La contraseña nueva es obligatoria' })
  @IsString({ message: 'La contraseña nueva es obligatoria' })
  contrasenaNueva: string;
}

export class MensajeDto {
  @ApiProperty()
  mensaje: string;
}
