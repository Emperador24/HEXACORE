import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export enum OrdenCartelera {
  /** CU-005A: sin indicación, el listado va por fecha. */
  FECHA = 'fecha',
  /** Los que más se están vendiendo primero (DECISIONES.md §12). */
  RELEVANCIA = 'relevancia',
}

/** Recorta espacios y convierte "" en "sin filtro", para que `?ciudad=` no filtre por la ciudad vacía. */
const recortar = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const recortado = value.trim();
  return recortado === '' ? undefined : recortado;
};

/**
 * "true"/"false" de la URL a booleano. Cualquier otro valor pasa tal cual y
 * `@IsBoolean` lo rechaza con un 400, en vez de adivinar qué quiso decir.
 */
const aBooleano = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/**
 * Filtros de la cartelera — entradas del CU-005: *"categoría, fecha, ciudad,
 * artista"*.
 *
 * Esta clase es la mitad del paso 2 (*"Valida los filtros ingresados"*): el
 * `ValidationPipe` global la aplica antes de que el controlador vea la
 * petición, y responde 400 si algo no encaja. La otra mitad —que `desde` no
 * sea posterior a `hasta`— relaciona dos campos y la comprueba el servicio.
 */
export class ConsultarCarteleraDto {
  @ApiPropertyOptional({ example: 'Conciertos', description: 'Sin distinguir mayúsculas' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(60)
  categoria?: string;

  @ApiPropertyOptional({ example: 'Bogotá', description: 'Sin distinguir mayúsculas' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(120)
  ciudad?: string;

  @ApiPropertyOptional({ example: 'shakira', description: 'Coincidencia parcial y sin distinguir mayúsculas' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  artista?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Eventos que empiezan desde este día (hora de Colombia) o este instante ISO 8601',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Eventos que empiezan hasta este día inclusive (hora de Colombia) o este instante ISO 8601',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  hasta?: string;

  @ApiPropertyOptional({ enum: OrdenCartelera, default: OrdenCartelera.FECHA })
  @IsOptional()
  @IsEnum(OrdenCartelera)
  orden?: OrdenCartelera;

  @ApiPropertyOptional({ default: false, description: 'Incluir también los eventos que ya se celebraron' })
  @IsOptional()
  // No `@Type(() => Boolean)`: convertiría el texto "false" en `true`, porque
  // cualquier cadena no vacía es verdadera en JavaScript.
  @Transform(aBooleano)
  @IsBoolean()
  incluirPasados?: boolean;

  /** Paginado desde el primer día, como el mercado de reventa: la ficha pide soportar "un catálogo grande". */
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

/** Un evento en el listado: la *"información resumida"* del paso 5. */
export class EventoResumenDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'HEXACORE Fest 2026' }) nombre: string;
  @ApiProperty({ example: 'Aterciopelados', nullable: true, type: String }) artista: string | null;
  @ApiProperty({ example: 'Festivales' }) categoria: string;
  @ApiProperty({ description: 'Inicio del evento, ISO 8601' }) fechaInicio: string;
  @ApiProperty({ description: 'Fin del evento, ISO 8601', nullable: true, type: String }) fechaFin: string | null;
  @ApiProperty({ example: 'Movistar Arena' }) lugar: string;
  @ApiProperty({ example: 'Bogotá' }) ciudad: string;
  @ApiProperty({ nullable: true, type: String }) imagenUrl: string | null;

  @ApiProperty({
    description: 'Precio más bajo con cupo; si todo está agotado, el más bajo sin más. Null si aún no tiene localidades.',
    nullable: true,
    type: Number,
    example: 180000,
  })
  precioDesde: number | null;

  @ApiProperty({ description: 'Ninguna localidad tiene cupo' }) agotado: boolean;
  @ApiProperty({ description: 'El evento ya empezó o terminó' }) pasado: boolean;
}

export class CarteleraDto {
  @ApiProperty({ type: [EventoResumenDto] }) eventos: EventoResumenDto[];
  @ApiProperty({ description: 'Eventos que cumplen los filtros, sin paginar' }) total: number;
  @ApiProperty() limite: number;
  @ApiProperty() desplazamiento: number;

  @ApiProperty({
    description: 'CU-005C: "Ningún evento encontrado" cuando no hay resultados; null en otro caso',
    nullable: true,
    type: String,
  })
  mensaje: string | null;
}

export class LocalidadDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Palco VIP' }) nombre: string;
  @ApiProperty({ example: 420000 }) precio: number;
  @ApiProperty({ description: 'Cupos que quedan', example: 37 }) disponibles: number;
  @ApiProperty() agotada: boolean;
}

/** Paso 8: *"información completa del evento (horarios, localidades, precios y disponibilidad)"*. */
export class EventoDetalleDto extends EventoResumenDto {
  @ApiProperty({ nullable: true, type: String }) descripcion: string | null;
  @ApiProperty({ type: [LocalidadDto] }) localidades: LocalidadDto[];
  @ApiProperty({ description: 'Suma de los cupos de todas las localidades' }) disponiblesTotal: number;
}

/** Valores con los que el portal llena los desplegables de filtros. */
export class FiltrosCarteleraDto {
  @ApiProperty({ type: [String], example: ['Conciertos', 'Teatro'] }) categorias: string[];
  @ApiProperty({ type: [String], example: ['Bogotá', 'Medellín'] }) ciudades: string[];
}
