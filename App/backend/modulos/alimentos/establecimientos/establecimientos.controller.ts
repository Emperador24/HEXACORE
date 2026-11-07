import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { validacionAlimentos } from '../../../compartido/validacion';
import { PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { EstablecimientosService } from './establecimientos.service';
import { EstadoEstablecimientoDto, GuardarEstablecimientoDto } from './guardar-establecimiento.dto';

@ApiTags('gestión de establecimientos CU-015')
@ApiBearerAuth()
@Controller('pedidos/admin/establecimientos')
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
@UsePipes(validacionAlimentos)
export class EstablecimientosController {
  constructor(private readonly locales: EstablecimientosService) {}
  @Get()
  listar(@Query('eventoId', ParseUUIDPipe) eventoId: string) { return this.locales.listar(eventoId); }
  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) { return this.locales.detalle(id); }
  @Post()
  crear(@Body() dto: GuardarEstablecimientoDto) { return this.locales.guardar(dto); }
  @Put(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarEstablecimientoDto) { return this.locales.guardar(dto, id); }
  @Patch(':id/estado')
  estado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EstadoEstablecimientoDto) { return this.locales.cambiarEstado(id, dto.estado); }
  @Put(':id/personal/:usuarioId')
  asignar(@Param('id', ParseUUIDPipe) id: string, @Param('usuarioId', ParseUUIDPipe) usuarioId: string, @Req() r: PeticionConSesion) {
    return this.locales.asignar(id, usuarioId, r.sesion!.usuarioId);
  }
  @Delete(':id/personal/:usuarioId')
  @HttpCode(204)
  desvincular(@Param('id', ParseUUIDPipe) id: string, @Param('usuarioId', ParseUUIDPipe) usuarioId: string) {
    return this.locales.desvincular(id, usuarioId);
  }
}
