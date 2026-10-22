import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NombrePersona } from './nombre-persona.decorator';

/**
 * Paso 1 del CU-027: *"el usuario accede al formulario de registro e ingresa su
 * nombre, correo y contraseña"*.
 *
 * La contraseña **no se valida aquí con `class-validator`**, solo su longitud
 * máxima. Su fortaleza (paso 2) depende de la configuración del servicio, que
 * un decorador no puede leer: se comprueba en el servicio de cuentas, donde
 * está la política.
 */
export class RegistroDto {
  @ApiProperty({ example: 'Ana Gómez', minLength: 2, maxLength: 160 })
  @NombrePersona()
  nombre: string;

  @ApiProperty({ example: 'ana@hexacore.com', maxLength: 254 })
  // Los decoradores de class-validator se evalúan de abajo arriba, así que
  // `IsEmail` va el último para que sea el primero en ejecutarse: si va
  // después de `MaxLength`, omitir el correo responde "es demasiado largo"
  // en vez de "no tiene un formato válido".
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  // Se normaliza en la entrada, no solo al guardar: así la comprobación de
  // "¿ya existe?" del paso 3 compara lo mismo que la base tiene guardado.
  // Sin esto, "Ana@Hexacore.com" pasaría la comprobación y luego chocaría
  // contra el índice único.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  email: string;

  @ApiProperty({
    example: 'una frase de paso larga',
    description:
      'La longitud mínima la fija AUTH_LONGITUD_MINIMA_CONTRASENA; el máximo son 200 caracteres. ' +
      'No se exigen mayúsculas ni símbolos: ver DECISIONES.md §2.',
  })
  // Aquí solo se comprueba que la contraseña venga. **Toda su política
  // —longitud mínima, máxima y lista de comunes— vive en
  // `problemaDeContrasena`**, un solo sitio: repartirla entre decoradores y
  // servicio produce mensajes que se contradicen. Ya pasó: al omitir el campo,
  // un `@MaxLength` respondía "la contraseña es demasiado larga".
  @IsString({ message: 'La contraseña es obligatoria' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  contrasena: string;
}

/**
 * Respuesta del registro.
 *
 * **Es idéntica exista o no el correo.** El atributo de Usabilidad del CU-027
 * prohíbe revelar si un correo está registrado, y un registro que respondiera
 * "ese correo ya existe" convertiría el formulario en una herramienta para
 * averiguar quién tiene cuenta. Ver DECISIONES.md §8.
 *
 * Por eso tampoco devuelve el identificador de la cuenta: hacerlo distinguiría
 * el caso "creada" del caso "ya existía".
 */
export class RegistroAceptadoDto {
  @ApiProperty({
    example: 'Si el correo no estaba registrado, te enviamos un enlace para verificar tu cuenta.',
  })
  mensaje: string;
}
