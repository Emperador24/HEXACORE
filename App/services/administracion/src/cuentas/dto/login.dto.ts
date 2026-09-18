import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { LARGO_MAXIMO_CONTRASENA } from '../../comun/contrasenas';

/**
 * Paso 8 del CU-027: *"el usuario inicia sesión con sus credenciales"*.
 *
 * ## Por qué aquí se valida mucho menos que en el registro
 *
 * El registro comprueba la fortaleza de la contraseña; el login **no**, y no es
 * un olvido. Aplicar aquí la política rechazaría con un error distinto a quien
 * teclea algo corto, y esa diferencia es explotable: revelaría que ninguna
 * cuenta puede tener una contraseña así, y peor, distinguiría el formato del
 * error según lo enviado en lugar de según las credenciales.
 *
 * Lo único que se acota es el tamaño, y por una razón operativa: `scrypt` sobre
 * una cadena de megabytes consume memoria y tiempo, así que sin tope el propio
 * formulario de login sería una forma de tumbar el servicio.
 */
export class LoginDto {
  @ApiProperty({ example: 'ana@hexacore.com', maxLength: 254 })
  // Se normaliza igual que en el registro. Sin esto, quien se registró como
  // "Ana@…" no podría entrar escribiendo "ana@…", que es lo que hará el
  // teclado de un móvil con la mayúscula automática.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MaxLength(254, { message: 'El correo o la contraseña no son correctos' })
  // class-validator evalúa los decoradores de abajo arriba: `IsEmail` va el
  // último para que sea el primero en comprobarse.
  @IsEmail({}, { message: 'El correo o la contraseña no son correctos' })
  email: string;

  @ApiProperty({ example: 'una-contrasena-larga', maxLength: LARGO_MAXIMO_CONTRASENA })
  // Los mensajes son deliberadamente los mismos que los de un fallo de
  // credenciales: distinguirlos diría si el problema estaba en el correo o en
  // la contraseña, que es justo lo que el CU-027 no quiere contar.
  @MaxLength(LARGO_MAXIMO_CONTRASENA, { message: 'El correo o la contraseña no son correctos' })
  @IsString({ message: 'El correo o la contraseña no son correctos' })
  contrasena: string;
}

/** Quién es quien acaba de entrar. Evita una segunda llamada nada más entrar. */
export class UsuarioDeSesionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana Gómez' })
  nombre: string;

  @ApiProperty({ example: 'ana@hexacore.com' })
  email: string;

  @ApiProperty({ example: ['Cliente'], description: 'Roles del CU-028.' })
  roles: string[];
}

/** Paso 9 del CU-027: el token de sesión recién emitido. */
export class SesionIniciadaDto {
  @ApiProperty({ description: 'Token de sesión. Va en `Authorization: Bearer <token>`.' })
  token: string;

  @ApiProperty({ example: 'Bearer' })
  tipo: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Cuándo caduca el token. Se devuelve para que el cliente pueda renovar antes de que ' +
      'caduque en mitad de algo, en vez de enterarse con un 401.',
  })
  expiraEn: string;

  @ApiPropertyOptional({
    description:
      'Token de renovación. Se guarda en el almacén seguro del dispositivo y **solo** se envía a ' +
      '`POST /sesiones/renovar`. Cada renovación devuelve uno nuevo y el anterior deja de valer. ' +
      '**No viene** si la petición lleva `X-Hexacore-Cliente: web`: entonces va en una cookie ' +
      '`HttpOnly` que JavaScript no puede leer.',
  })
  tokenRenovacion?: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Hasta cuándo se puede renovar si no se usa. Cada renovación la aplaza.',
  })
  renovacionExpiraEn: string;

  @ApiProperty({ type: UsuarioDeSesionDto })
  usuario: UsuarioDeSesionDto;
}

export class RenovarSesionDto {
  @ApiPropertyOptional({
    description:
      'El token de renovación recibido al iniciar sesión o en la última renovación. Los clientes ' +
      'web no lo envían: va en la cookie.',
  })
  @IsOptional()
  @IsString({ message: 'Tu sesión terminó. Inicia sesión de nuevo.' })
  @MaxLength(200, { message: 'Tu sesión terminó. Inicia sesión de nuevo.' })
  tokenRenovacion?: string;
}

/** Lo que devuelve una renovación: lo mismo que el login, salvo el usuario. */
export class SesionRenovadaDto {
  @ApiProperty() token: string;
  @ApiProperty({ example: 'Bearer' }) tipo: string;
  @ApiProperty({ format: 'date-time' }) expiraEn: string;
  @ApiPropertyOptional({ description: 'Ausente para clientes web (va en la cookie).' })
  tokenRenovacion?: string;
  @ApiProperty({ format: 'date-time' }) renovacionExpiraEn: string;
  @ApiProperty({ example: ['Cliente'], description: 'Roles actuales, leídos de la base al renovar.' })
  roles: string[];
}

export class SesionCerradaDto {
  @ApiProperty({ example: 'Sesión cerrada.' })
  mensaje: string;
}
