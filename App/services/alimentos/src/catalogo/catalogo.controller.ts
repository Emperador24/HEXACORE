import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CatalogoService } from './catalogo.service';
import { EstablecimientoDto } from './dto/establecimiento.dto';
import { ProductoDto } from './dto/producto.dto';

@ApiTags('catálogo de pedidos')
@Controller('pedidos')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('establecimientos/:establecimientoId/productos')
  @ApiOperation({
    summary: 'Consultar productos activos de un establecimiento',
    description: 'Incluye los productos activos con inventario cero. Devuelve una lista vacía si no hay productos activos.',
  })
  @ApiResponse({ status: 200, type: [ProductoDto] })
  @ApiBadRequestResponse({ description: 'El identificador del establecimiento no es un UUID válido' })
  @ApiNotFoundResponse({ description: 'No existe el establecimiento' })
  listarProductos(
    @Param('establecimientoId', ParseUUIDPipe) establecimientoId: string,
  ): Promise<ProductoDto[]> {
    return this.catalogo.listarProductos(establecimientoId);
  }

  @Get('eventos/:eventoId/establecimientos')
  @ApiOperation({
    summary: 'Consultar establecimientos disponibles de un evento',
    description: 'Devuelve una lista vacía si el evento no está disponible o no tiene establecimientos disponibles.',
  })
  @ApiResponse({ status: 200, type: [EstablecimientoDto] })
  @ApiBadRequestResponse({ description: 'El identificador del evento no es un UUID válido' })
  @ApiNotFoundResponse({ description: 'No existe el evento' })
  listarEstablecimientos(
    @Param('eventoId', ParseUUIDPipe) eventoId: string,
  ): Promise<EstablecimientoDto[]> {
    return this.catalogo.listarEstablecimientos(eventoId);
  }
}
