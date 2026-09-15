import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator';
import { Entrada } from '../../persistencia/entidades/entrada.entity';
import { EstadoPublicacion, PublicacionReventa } from '../../persistencia/entidades/publicacion-reventa.entity';

/** Tope duro del importe: es lo que cabe en `numeric(12,2)`. */
const MAXIMO_NUMERIC_12_2 = 9_999_999_999.99;

/** Paso 3 del CU-006: *"Establece el precio de venta y confirma la publicación"*. */
export class PublicarEntradaDto {
  @ApiProperty({ description: 'Entrada propia que se quiere publicar', format: 'uuid' })
  @IsUUID()
  entradaId: string;

  @ApiProperty({ description: 'Precio de venta en el mercado secundario', example: 300000 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio admite como máximo dos decimales' })
  @IsPositive({ message: 'El precio debe ser mayor que cero' })
  @Max(MAXIMO_NUMERIC_12_2, { message: 'El precio excede el máximo representable' })
  precio: number;
}

/** Flujo alterno **CU-006A**: *"El vendedor cambia el precio de la publicación antes de que sea comprada"*. */
export class CambiarPrecioDto {
  @ApiProperty({ description: 'Nuevo precio de venta', example: 280000 })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio admite como máximo dos decimales' })
  @IsPositive({ message: 'El precio debe ser mayor que cero' })
  @Max(MAXIMO_NUMERIC_12_2, { message: 'El precio excede el máximo representable' })
  precio: number;
}

/**
 * Una publicación tal como la ve el cliente.
 *
 * Se construye a mano en vez de devolver la entidad porque una entidad expone
 * lo que la base necesita, no lo que el cliente debe ver: aquí se decide
 * explícitamente qué sale. Por ejemplo, la publicación incluye el nombre del
 * evento y de la localidad (que el móvil y el portal necesitan pintar) pero no
 * el `localidadId` ni las marcas de auditoría.
 */
export class PublicacionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) entradaId: string;
  @ApiProperty({ format: 'uuid' }) vendedorId: string;
  @ApiProperty({ example: 300000 }) precio: number;
  @ApiProperty({ description: 'Precio de la venta primaria; el cliente lo usa para mostrar el ahorro', example: 250000 })
  precioOriginal: number;
  @ApiProperty({ enum: EstadoPublicacion }) estado: EstadoPublicacion;
  @ApiProperty() eventoId: string;
  @ApiProperty({ example: 'HEXACORE Fest 2026' }) eventoNombre: string;
  @ApiProperty({ example: 'Movistar Arena' }) lugar: string;
  @ApiProperty({ example: 'General' }) localidadNombre: string;
  @ApiProperty() fechaEvento: string;
  @ApiProperty() fechaPublicacion: string;
  @ApiProperty({ description: 'Cuándo deja de poder venderse (CU-006D)' }) fechaExpiracion: string;
  @ApiPropertyOptional({ description: 'Máximo que este vendedor puede pedir por esta entrada' })
  precioMaximo?: number;
}

/** Una entrada propia, para la pantalla desde la que el vendedor elige qué publicar (paso 1). */
export class EntradaPropiaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'TCK-2026-000001' }) numeroTicket: string;
  @ApiProperty() eventoId: string;
  @ApiProperty({ example: 'HEXACORE Fest 2026' }) eventoNombre: string;
  @ApiProperty({ example: 'Movistar Arena' }) lugar: string;
  @ApiProperty({ example: 'General' }) localidadNombre: string;
  @ApiProperty({ example: 250000 }) precioOriginal: number;
  @ApiProperty({ example: 'VALIDA' }) estado: string;
  @ApiProperty() fechaEvento: string;

  /**
   * Si esta entrada se puede publicar ahora mismo, y si no, por qué.
   *
   * El cliente NO recalcula estas condiciones: se las dan hechas. Es lo que
   * pide RNF-14 (*"0 reglas de negocio duplicadas en el cliente"*) y ASR-10.
   * Sin esto, el móvil y el portal tendrían cada uno su propia copia de "puede
   * revenderse si está VALIDA y el evento lo permite y no ha empezado", y
   * tarde o temprano una de las dos copias se quedaría atrás.
   */
  @ApiProperty({ description: 'Si puede publicarse ahora mismo' }) puedePublicarse: boolean;
  @ApiPropertyOptional({ description: 'Código del camino del CU-006 que lo impide (CU-006E, CU-006F, CU-006D…)' })
  motivoBloqueo?: string;
  @ApiPropertyOptional({ description: 'Explicación legible del bloqueo' })
  detalleBloqueo?: string;
  @ApiPropertyOptional({ description: 'Precio máximo permitido si se publica' })
  precioMaximo?: number;
  @ApiPropertyOptional({ description: 'Publicación activa de esta entrada, si ya está en el mercado' })
  publicacion?: PublicacionDto;
}

export function aPublicacionDto(
  publicacion: PublicacionReventa,
  entrada: Entrada,
  eventoNombre: string,
  lugar: string,
  fechaEvento: Date,
  precioMaximo?: number,
): PublicacionDto {
  return {
    id: publicacion.id,
    entradaId: publicacion.entradaId,
    vendedorId: publicacion.vendedorId,
    precio: publicacion.precio,
    precioOriginal: publicacion.precioOriginal,
    estado: publicacion.estado,
    eventoId: entrada.eventoId,
    eventoNombre,
    lugar,
    localidadNombre: entrada.localidadNombre,
    fechaEvento: fechaEvento.toISOString(),
    fechaPublicacion: publicacion.fechaPublicacion.toISOString(),
    fechaExpiracion: publicacion.fechaExpiracion.toISOString(),
    precioMaximo,
  };
}
