import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
function claveOperacion(valor: string): string {
  if (typeof valor !== 'string' || !isUUID(valor)) throw new BadRequestException('Indica Idempotency-Key con UUID para identificar esta operación.');
  return valor.toLowerCase();
}
import { PersonalDelEstablecimiento } from '../establecimientos/personal-establecimiento.module';
import { validacionAlimentos } from '../../../compartido/validacion';
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put, Req, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Response } from 'express';
import { PeticionConSesion } from '../comun/autenticacion/sesion-valida.guard';
import { AjustesInventarioService } from '../inventario/ajustes-inventario.service';
import { AjustarInventarioDto, GuardarProductoDto, RegistrarProductoDto } from './dto/guardar-producto.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { ProductoDto } from '../catalogo/dto/producto.dto';
import { ActualizarProductoDto } from './dto/actualizar-producto.dto';
import { MenuService } from './menu.service';

@ApiTags('administración del menú')
@ApiBearerAuth()
@UseGuards(SesionValida, PersonalDelEstablecimiento)
@RolesPermitidos('Personal')
@UsePipes(validacionAlimentos)
@Controller('pedidos/establecimientos')
export class MenuController {
  constructor(private readonly menu: MenuService, private readonly ajustes: AjustesInventarioService) {}

  @Post(':establecimientoId/productos')
  registrar(@Param('establecimientoId', ParseUUIDPipe) id: string, @Body() dto: RegistrarProductoDto,
    @Headers('idempotency-key') clave: string, @Req() r: PeticionConSesion) {
    return this.menu.registrar(id, r.sesion!.usuarioId, claveOperacion(clave), dto);
  }

  @Put(':establecimientoId/productos/:productoId')
  editar(@Param('establecimientoId', ParseUUIDPipe) id: string, @Param('productoId', ParseUUIDPipe) productoId: string,
    @Body() dto: GuardarProductoDto) { return this.menu.editar(id, productoId, dto); }

  @Post(':establecimientoId/productos/:productoId/ajustes')
  async ajustar(@Param('establecimientoId', ParseUUIDPipe) id: string, @Param('productoId', ParseUUIDPipe) productoId: string,
    @Headers('idempotency-key') clave: string, @Body() dto: AjustarInventarioDto,
    @Req() r: PeticionConSesion, @Res({ passthrough: true }) respuesta: Response) {
    const op = await this.ajustes.solicitar(id, r.sesion!.usuarioId, claveOperacion(clave), { productoId, ...dto });
    respuesta.status(op.estado === 'PENDIENTE' ? 202 : op.estado === 'RECHAZADA' ? 409 : 200);
    return op;
  }

  @Get(':establecimientoId/operaciones/:operacionId')
  async operacion(@Param('establecimientoId', ParseUUIDPipe) id: string, @Param('operacionId', ParseUUIDPipe) op: string) {
    await this.ajustes.recuperarEstablecimiento(id);
    return this.ajustes.consultar(id, op);
  }
  @Get(':establecimientoId/ajustes')
  historial(@Param('establecimientoId', ParseUUIDPipe) id: string) { return this.ajustes.historial(id); }

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
