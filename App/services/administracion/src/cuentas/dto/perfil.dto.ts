import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { LARGO_MAXIMO_CONTRASENA } from '../../comun/contrasenas';
import { NombrePersona } from './nombre-persona.decorator';

/** Lo que el usuario ve de su propia cuenta. */
export class PerfilDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana Gómez' })
  nombre: string;

  @ApiProperty({ example: 'ana@hexacore.com' })
  email: string;

  @ApiProperty({ example: ['Cliente'] })
  roles: string[];

  @ApiProperty({ format: 'date-time' })
  creadoEn: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Último inicio de sesión. Sirve para que la persona reconozca un acceso que no hizo.',
  })
  ultimoAccesoEn: string | null;
}

/**
 * CU-027C: *"si el usuario edita su perfil, el sistema valida los nuevos datos
 * antes de guardarlos"*.
 */
export class EditarPerfilDto {
  @ApiProperty({ example: 'Ana María Gómez', minLength: 2, maxLength: 160 })
  @NombrePersona()
  nombre: string;

  /**
   * Se declara solo para poder rechazarlo con un mensaje claro.
   *
   * Sin declararlo, `forbidNonWhitelisted` lo rechazaría igual, pero con un
   * "property email should not exist" en inglés, que contradice el "mensajes de
   * error claros" del CU-027. Ver DECISIONES.md §14.
   */
  @ApiPropertyOptional({ deprecated: true, description: 'No se admite: el correo no es editable.' })
  @IsOptional()
  email?: unknown;
}

/** CU-027C, aplicado a la contraseña. */
export class CambiarContrasenaDto {
  @ApiProperty()
  // Solo se acota el tamaño: aplicar la política a la contraseña actual
  // impediría cambiarla a quien la tenga de antes de una política más estricta.
  @MaxLength(LARGO_MAXIMO_CONTRASENA, { message: 'La contraseña actual no es correcta' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  @IsString({ message: 'La contraseña actual es obligatoria' })
  contrasenaActual: string;

  @ApiProperty({ description: 'Misma política que en el registro (DECISIONES.md §2).' })
  @IsNotEmpty({ message: 'La contraseña nueva es obligatoria' })
  @IsString({ message: 'La contraseña nueva es obligatoria' })
  contrasenaNueva: string;
}
