import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { ModuloPermisos, PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import {
  AsignarResponsableDto,
  CerrarIncidenteDto,
  EstadoIncidente,
  ReclasificarPrioridadDto,
  RegistrarIncidenteDto,
  ReportarAvanceDto,
} from './dto/incidentes.dto';
import { IncidentesService } from './incidentes.service';

/**
 * CU-020: Gestionar incidentes.
 *
 * El personal operativo registra incidentes y reporta su propio avance; solo
 * el supervisor (Organizador o Administrador, igual que en CU-019: el
 * sistema no tiene ese rol de cuenta) reclasifica la prioridad y asigna un
 * responsable.
 */
@Controller('incidentes')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Personal', 'Organizador', 'Administrador')
@ModuloPermisos('emergencias')
export class IncidentesController {
  constructor(private readonly incidentes: IncidentesService) {}

  /** Paso 1: el personal registra el incidente ocurrido. */
  @Post('eventos/:eventoId/incidentes')
  registrar(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: RegistrarIncidenteDto, @Req() peticion: PeticionConSesion) {
    return this.incidentes.registrar(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Get('eventos/:eventoId/incidentes')
  listar(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query('estado') estado?: EstadoIncidente) {
    return this.incidentes.listarDeEvento(eventoId, estado);
  }

  @Get('incidentes/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentes.detalle(id);
  }

  /** CU-020A: el supervisor reclasifica la prioridad. */
  @Patch('incidentes/:id/prioridad')
  @RolesPermitidos('Organizador', 'Administrador')
  reclasificar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReclasificarPrioridadDto, @Req() peticion: PeticionConSesion) {
    return this.incidentes.reclasificar(id, dto, peticion.sesion!.usuarioId);
  }

  /** Paso 5: el supervisor asigna un responsable. */
  @Post('incidentes/:id/responsable')
  @RolesPermitidos('Organizador', 'Administrador')
  asignarResponsable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AsignarResponsableDto, @Req() peticion: PeticionConSesion) {
    return this.incidentes.asignarResponsable(id, dto, peticion.sesion!.usuarioId);
  }

  /** Pasos 7-8: el responsable (o el supervisor) reporta el avance. */
  @Patch('incidentes/:id/avance')
  avance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportarAvanceDto, @Req() peticion: PeticionConSesion) {
    return this.incidentes.reportarAvance(id, dto, peticion.sesion!.usuarioId);
  }

  /** CU-020B: cerrar directamente, con nota de resolución, sin escalar. */
  @Post('incidentes/:id/cerrar')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarIncidenteDto, @Req() peticion: PeticionConSesion) {
    return this.incidentes.cerrar(id, dto, peticion.sesion!.usuarioId);
  }
}
