import { UsePipes } from '@nestjs/common';
import { validacionLogistica } from '../../../compartido/validacion';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import type { PeticionDeLogistica } from './autorizacion.guard';
import { ContextoDeLogistica, SoloQuienSupervisa } from './autorizacion.guard';
import { ActualizarEmpleadoDto } from './dto/actualizar-empleado.dto';
import { MotivoDto } from './dto/motivo.dto';
import { ResponderAsignacionDto } from './dto/responder-asignacion.dto';
import { GestionPersonalService } from './gestion-personal.service';

/**
 * CU-007: Gestión de personal para eventos.
 *
 * Se registra **después** de `TurnosController`: `empleados/yo` tiene que
 * resolverse antes que `empleados/:id`, y Nest decide por orden de registro.
 * El `ParseUUIDPipe` es la segunda red: `yo` no pasaría como identificador.
 *
 * Quién hace cada operación sale siempre de la sesión, nunca del cuerpo.
 */
@UsePipes(validacionLogistica)
@Controller('logistica')
@UseGuards(SesionValida, ContextoDeLogistica)
export class GestionPersonalController {
  constructor(private readonly personal: GestionPersonalService) {}

  @Get('empleados/:id')
  @UseGuards(SoloQuienSupervisa)
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.personal.detalle(id);
  }

  @Patch('empleados/:id')
  @UseGuards(SoloQuienSupervisa)
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarEmpleadoDto, @Req() peticion: PeticionDeLogistica) {
    return this.personal.actualizar(id, dto, peticion.sesion!.usuarioId);
  }

  @Post('empleados/:id/desactivar')
  @UseGuards(SoloQuienSupervisa)
  desactivar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MotivoDto, @Req() peticion: PeticionDeLogistica) {
    return this.personal.desactivar(id, dto.motivo.trim(), peticion.sesion!.usuarioId);
  }

  @Post('empleados/:id/reactivar')
  @UseGuards(SoloQuienSupervisa)
  reactivar(@Param('id', ParseUUIDPipe) id: string, @Req() peticion: PeticionDeLogistica) {
    return this.personal.reactivar(id, peticion.sesion!.usuarioId);
  }

  @Get('zonas/:zonaId/candidatos')
  @UseGuards(SoloQuienSupervisa)
  candidatos(
    @Param('zonaId', ParseUUIDPipe) zonaId: string,
    @Query('horaInicio') horaInicio?: string,
    @Query('horaFin') horaFin?: string,
    @Query('excluirTurnoId', new ParseUUIDPipe({ optional: true })) excluirTurnoId?: string,
  ) {
    return this.personal.candidatos(zonaId, horaInicio, horaFin, excluirTurnoId);
  }

  @Get('asignaciones')
  @UseGuards(SoloQuienSupervisa)
  asignaciones(@Query('eventoId') eventoId: string) {
    return this.personal.asignacionesDeEvento(eventoId);
  }

  @Post('turnos/:turnoId/cancelar')
  @UseGuards(SoloQuienSupervisa)
  cancelar(@Param('turnoId', ParseUUIDPipe) turnoId: string, @Body() dto: MotivoDto, @Req() peticion: PeticionDeLogistica) {
    return this.personal.cancelarAsignacion(turnoId, dto.motivo.trim(), peticion.sesion!.usuarioId);
  }

  /** Paso 13 / CU-007B: lo responde el propio empleado, desde la app. */
  @Post('turnos/:turnoId/respuesta')
  responder(@Param('turnoId', ParseUUIDPipe) turnoId: string, @Body() dto: ResponderAsignacionDto, @Req() peticion: PeticionDeLogistica) {
    return this.personal.responder(turnoId, dto, {
      empleadoId: peticion.empleado?.id ?? null,
      usuarioId: peticion.sesion!.usuarioId,
    });
  }
}
