import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CarteleraService } from './cartelera.service';
import { CarteleraDto, ConsultarCarteleraDto, EventoDetalleDto, FiltrosCarteleraDto } from './dto/cartelera.dto';

/**
 * Cartelera pública de eventos (CU-005).
 *
 * **Sin `SesionValida` a propósito**: la cartelera se ve sin iniciar sesión,
 * como en cualquier taquilla (README del portal cliente) y como pide la ficha
 * — *"es la puerta de entrada al sistema"*. Es la única excepción a RNF-06 en
 * este servicio; ver DECISIONES.md §12. Solo lee, y no devuelve nada de ningún
 * usuario.
 *
 * `Cache-Control: public` deja que el navegador —y una CDN, que es lo que la
 * ficha pide para los eventos de alta demanda— guarden la respuesta unos
 * segundos. El detalle, que trae la disponibilidad, se guarda menos. Que la
 * cifra vaya unos segundos por detrás es aceptable: la compra (CU-001) vuelve a
 * comprobar el cupo en la base.
 */
@ApiTags('cartelera')
@Controller('cartelera')
export class CarteleraController {
  constructor(private readonly cartelera: CarteleraService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({
    summary: 'Consultar la cartelera de eventos',
    description:
      'Pasos 1-5 del CU-005. Filtra por categoría, ciudad, artista y rango de fechas; sin filtros, ' +
      'devuelve los próximos eventos por fecha (CU-005A). Sin resultados, `mensaje` trae ' +
      '"Ningún evento encontrado" (CU-005C). Pública: no requiere sesión.',
  })
  @ApiResponse({ status: 200, type: CarteleraDto })
  @ApiBadRequestResponse({ description: 'Un filtro no es válido, o "desde" es posterior a "hasta"' })
  listar(@Query() filtros: ConsultarCarteleraDto): Promise<CarteleraDto> {
    return this.cartelera.listar(filtros);
  }

  // Antes que `:id`: si no, Nest intentaría leer "filtros" como identificador.
  @Get('filtros')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Valores disponibles para los filtros',
    description: 'Categorías y ciudades con eventos próximos, para llenar los desplegables. Pública.',
  })
  @ApiResponse({ status: 200, type: FiltrosCarteleraDto })
  filtros(): Promise<FiltrosCarteleraDto> {
    return this.cartelera.filtros();
  }

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=10')
  @ApiOperation({
    summary: 'Detalle de un evento',
    description: 'Pasos 6-8 del CU-005: horarios, localidades, precios y disponibilidad. Pública.',
  })
  @ApiResponse({ status: 200, type: EventoDetalleDto })
  @ApiNotFoundResponse({ description: 'El evento no existe o no está publicado' })
  detalle(@Param('id', ParseUUIDPipe) id: string): Promise<EventoDetalleDto> {
    return this.cartelera.detalle(id);
  }
}
