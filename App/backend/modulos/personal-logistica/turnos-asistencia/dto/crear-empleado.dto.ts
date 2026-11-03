import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CrearEmpleadoDto {
  /** `id` del usuario en el Servicio de Administración (CU-027). */
  @ApiProperty({ description: 'id del usuario en Administración (CU-027)' })
  @IsUUID()
  usuarioId: string;

  @ApiProperty({ example: 'Luis Ramírez' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Entrada' })
  @IsString()
  @IsNotEmpty()
  rol: string;

  /** Lo que se escanea en el punto de control: QR o NFC del carné, no un correo. */
  @ApiProperty({ example: 'HXC-CARNET-00231' })
  @IsString()
  @IsNotEmpty()
  credencial: string;

  // CU-007: el portal los exige. La API los deja opcionales para no romper a
  // quien ya daba de alta fichas sin ellos (semillas, app móvil, pruebas).
  @ApiPropertyOptional({ example: '1020304050' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{5,20}$/, { message: 'El documento debe tener entre 5 y 20 letras, números o guiones.' })
  documento?: string;

  @ApiPropertyOptional({ example: 'luis.ramirez@hexacore.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido.' })
  correo?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567' })
  @IsOptional()
  @Matches(/^\+?[0-9 ]{7,20}$/, { message: 'El teléfono solo admite números, espacios y un + inicial.' })
  telefono?: string;
}
