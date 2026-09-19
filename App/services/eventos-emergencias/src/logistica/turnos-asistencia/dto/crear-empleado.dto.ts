import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Alta de un empleado, que solo hace un administrador.
 *
 * `usuarioId` es la cuenta del CU-027 a la que se le da de alta: sin ella, la
 * persona no podría iniciar sesión y la ficha no serviría de nada.
 */
export class CrearEmpleadoDto {
  @IsUUID('4', { message: 'usuarioId debe ser el identificador de una cuenta existente' })
  usuarioId: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  /**
   * Área de trabajo. Texto libre **a propósito**: qué áreas existen depende del
   * evento y del recinto, y fijarlas aquí obligaría a recompilar el servicio
   * para añadir una. La app móvil reconoce `Entrada`, `Parqueadero`,
   * `Restaurante` y `Jefe de personal`, y a cualquier otra le muestra las
   * pantallas comunes del personal.
   */
  @IsString()
  @IsNotEmpty()
  rol: string;

  /** Lo que se escanea en el punto de control: el QR o NFC del carné. */
  @IsString()
  @IsNotEmpty()
  credencial: string;
}
