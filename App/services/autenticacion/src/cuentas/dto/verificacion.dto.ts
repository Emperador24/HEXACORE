import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Paso 6 del CU-027: *"el usuario confirma su cuenta desde el enlace recibido"*. */
export class VerificarDto {
  @ApiProperty({
    description: 'El token que viajaba en el enlace del correo.',
    example: 'xhT9vK2mQp4rL8wZ...',
  })
  @IsString({ message: 'El enlace no es válido' })
  // 32 bytes en base64url son 43 caracteres. El rango acota sin ser exacto,
  // para no romper si algún día cambia el tamaño del token.
  @Length(20, 200, { message: 'El enlace no es válido' })
  token: string;
}

export class VerificacionCompletadaDto {
  @ApiProperty({ example: 'Tu cuenta quedó activada. Ya puedes iniciar sesión.' })
  mensaje: string;
}
