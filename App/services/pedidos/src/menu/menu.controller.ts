import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { ProductoDto } from '../catalogo/dto/producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { MenuService } from './menu.service';

@ApiTags('administración del menú')
@ApiBearerAuth()
@UseGuards(SesionValida)
@RolesPermitidos('Personal')
@Controller('pedidos/establecimientos')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get(':establecimientoId/menu')
  @ApiOperation({ summary: 'Consultar productos activos e inactivos del establecimiento' })
  @ApiResponse({ status: 200, type: [ProductoDto] })
  listar(@Param('establecimientoId', ParseUUIDPipe) establecimientoId: string): Promise<ProductoDto[]> {
    return this.menu.listar(establecimientoId);
  }

  @Patch(':establecimientoId/productos/:productoId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: 'Activar o desactivar un producto del establecimiento' })
  @ApiResponse({ status: 200, type: ProductoDto })
  actualizar(
    @Param('establecimientoId', ParseUUIDPipe) establecimientoId: string,
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Body() datos: ActualizarProductoDto,
  ): Promise<ProductoDto> {
    return this.menu.actualizar(establecimientoId, productoId, datos.activo);
  }
}
