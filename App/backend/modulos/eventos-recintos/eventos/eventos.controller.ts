import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { AccionPermiso, ModuloPermisos, PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { CancelarEventoDto, GuardarEventoDto, VersionDto } from './dto/guardar-evento.dto';
import { EventosService } from './eventos.service';

const ORGANIZADOR = 'Organizador';
const ADMINISTRADOR = 'Administrador';

/**
 * CU-026: Gestión de eventos.
 *
 * Crear, editar, publicar y cancelar es del Organizador (precondición 1). El
 * Administrador puede consultar, para soporte, pero no cambia nada. Quién hizo
 * cada cambio sale de la sesión y queda en el historial.
 */
@Controller('eventos')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos(ORGANIZADOR, ADMINISTRADOR)
@ModuloPermisos('eventos')
export class EventosController {
  constructor(private readonly eventos: EventosService) {}

  @Get()
  listar(@Query('estado') estado?: string) {
    return this.eventos.listar(estado);
  }

  /** Va antes de `:id`: Nest resuelve por orden de declaración. */
  @Get('disponibilidad')
  disponibilidad(
    @Query('recintoId', ParseUUIDPipe) recintoId: string,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('excluirEventoId', new ParseUUIDPipe({ optional: true })) excluirEventoId?: string,
  ) {
    return this.eventos.disponibilidad(recintoId, fechaInicio, fechaFin, excluirEventoId);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventos.detalle(id);
  }

  @Post()
  @RolesPermitidos(ORGANIZADOR)
  crear(@Body() dto: GuardarEventoDto, @Req() peticion: PeticionConSesion) {
    return this.eventos.crear(dto, peticion.sesion!.usuarioId);
  }

  @Put(':id')
  @RolesPermitidos(ORGANIZADOR)
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarEventoDto, @Req() peticion: PeticionConSesion) {
    return this.eventos.actualizar(id, dto, peticion.sesion!.usuarioId);
  }

  @Post(':id/publicar')
  @AccionPermiso('actualizar')
  @HttpCode(200)
  @RolesPermitidos(ORGANIZADOR)
  publicar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto, @Req() peticion: PeticionConSesion) {
    return this.eventos.publicar(id, dto.version, peticion.sesion!.usuarioId);
  }

  @Post(':id/cancelar')
  @AccionPermiso('actualizar')
  @HttpCode(200)
  @RolesPermitidos(ORGANIZADOR)
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelarEventoDto, @Req() peticion: PeticionConSesion) {
    return this.eventos.cancelar(id, dto.version, dto.motivo, peticion.sesion!.usuarioId);
  }

  @Delete(':id')
  @HttpCode(204)
  @RolesPermitidos(ORGANIZADOR)
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('version', ParseIntPipe) version: number,
    @Req() peticion: PeticionConSesion,
  ) {
    await this.eventos.eliminar(id, version, peticion.sesion!.usuarioId);
  }
}
