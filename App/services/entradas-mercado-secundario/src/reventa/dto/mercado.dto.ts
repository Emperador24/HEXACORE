import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Entrada } from '../../persistencia/entidades/entrada.entity';
import { EventoReferencia } from '../../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../../persistencia/entidades/publicacion-reventa.entity';

export enum OrdenMercado {
  RECIENTES = 'recientes',
  PRECIO_ASC = 'precio_asc',
  PRECIO_DESC = 'precio_desc',
  EVENTO_PROXIMO = 'evento_proximo',
}

/** Filtros del listado del mercado (paso 5 del CU-006). */
export class ConsultarMercadoDto {
  @ApiPropertyOptional({ description: 'Limitar a las publicaciones de un evento', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  eventoId?: string;

  @ApiPropertyOptional({ enum: OrdenMercado, default: OrdenMercado.RECIENTES })
  @IsOptional()
  @IsEnum(OrdenMercado)
  orden?: OrdenMercado;

  /**
   * Se pagina desde el primer día, aunque hoy el mercado quepa en una pantalla.
   *
   * ASR-04 describe *"miles de usuarios"* consultando a la vez en la apertura
   * de un evento masivo; un listado sin tope devolvería la tabla entera en cada
   * petición. Añadir paginación después obliga a cambiar el contrato y los dos
   * clientes a la vez.
   */
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  desplazamiento?: number;
}

/**
 * Una publicación tal como la ve un comprador.
 *
 * **No lleva `vendedorId`.** Quien compra necesita saber qué se vende y a qué
 * precio, no la identidad de quien lo vende; exponerla sería filtrar el
 * identificador de otro usuario sin que ninguna parte del CU-006 lo pida. El
 * vendedor sí ve el suyo en `mis-entradas`, porque ahí es su propia cuenta.
 */
export class PublicacionMercadoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) entradaId: string;
  @ApiProperty({ example: 300000 }) precio: number;
  @ApiProperty({ description: 'Precio de la venta primaria, para mostrar el ahorro', example: 250000 })
  precioOriginal: number;
  @ApiProperty({ enum: EstadoPublicacion }) estado: EstadoPublicacion;
  @ApiProperty({ format: 'uuid' }) eventoId: string;
  @ApiProperty({ example: 'HEXACORE Fest 2026' }) eventoNombre: string;
  @ApiProperty({ example: 'Movistar Arena' }) lugar: string;
  @ApiProperty({ example: 'Bogotá' }) ciudad: string;
  @ApiProperty({ example: 'General' }) localidadNombre: string;
  @ApiProperty() fechaEvento: string;
  @ApiProperty() fechaPublicacion: string;
  @ApiProperty({ description: 'Cuándo deja de poder comprarse (CU-006D)' }) fechaExpiracion: string;
  @ApiProperty({ description: 'Si la publicación es del propio solicitante' }) esPropia: boolean;
}

export class MercadoDto {
  @ApiProperty({ description: 'Publicaciones que cumplen el filtro, ya paginadas', type: [PublicacionMercadoDto] })
  publicaciones: PublicacionMercadoDto[];

  @ApiProperty({ description: 'Total de publicaciones que cumplen el filtro, sin paginar' })
  total: number;

  @ApiProperty() limite: number;
  @ApiProperty() desplazamiento: number;
}

export function aPublicacionMercadoDto(
  publicacion: PublicacionReventa,
  entrada: Entrada,
  evento: EventoReferencia,
  solicitanteId: string,
): PublicacionMercadoDto {
  return {
    id: publicacion.id,
    entradaId: publicacion.entradaId,
    precio: publicacion.precio,
    precioOriginal: publicacion.precioOriginal,
    estado: publicacion.estado,
    eventoId: evento.eventoId,
    eventoNombre: evento.nombre,
    lugar: evento.lugar,
    ciudad: evento.ciudad,
    localidadNombre: entrada.localidadNombre,
    fechaEvento: evento.fechaInicio.toISOString(),
    fechaPublicacion: publicacion.fechaPublicacion.toISOString(),
    fechaExpiracion: publicacion.fechaExpiracion.toISOString(),
    esPropia: publicacion.vendedorId === solicitanteId,
  };
}
