import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

/**
 * Validación del nombre, compartida por el registro (paso 2) y la edición del
 * perfil (CU-027C: *"valida los nuevos datos antes de guardarlos"*).
 *
 * Es una sola definición a propósito: si el perfil aceptara algo que el
 * registro rechaza, bastaría con registrarse con un nombre válido y cambiarlo
 * después para saltarse la regla.
 *
 * Los caracteres de control se rechazan porque el nombre acaba en el cuerpo de
 * los correos y en los logs: un salto de línea incrustado permite falsear
 * líneas enteras de ambos.
 */
export function NombrePersona(): PropertyDecorator {
  // Orden de comprobación: el de esta lista. `applyDecorators` los registra de
  // primero a último, al revés que al apilarlos con `@` (donde el de abajo se
  // registra primero). Con el orden invertido, omitir el nombre respondía
  // "contiene caracteres no permitidos".
  return applyDecorators(
    IsString({ message: 'El nombre es obligatorio' }),
    // `trim` antes de medir: " A " no debe pasar por un nombre de tres letras.
    Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    Length(2, 160, { message: 'El nombre debe tener entre 2 y 160 caracteres' }),
    Matches(/^[^\p{Cc}\p{Cf}]*$/u, { message: 'El nombre contiene caracteres no permitidos' }),
  );
}
