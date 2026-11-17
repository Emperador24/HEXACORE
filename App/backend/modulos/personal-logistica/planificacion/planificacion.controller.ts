import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { validacionLogistica as validacion } from '../../../compartido/validacion';
import { ModuloPermisos, PeticionConSesion, RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import {
  AprobarPlanDto,
  AsignarPersonalDto,
  AsignarProveedorDto,
  AsignarRecursoDto,
  CrearPlanDto,
  RegistrarRecursoDto,
  SolicitarPersonalAdicionalDto,
  TipoRecurso,
} from './dto/planificacion.dto';
import { PlanificacionService } from './planificacion.service';

/**
 * CU-016: Planificar logística del evento.
 *
 * Actor «Coordinador Logístico»: igual que en CU-030, lo ejercen Organizador
 * y Administrador (el sistema no tiene ese rol de cuenta, CU-027).
 */
@Controller('planificacion')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
@ModuloPermisos('personal')
export class PlanificacionController {
  constructor(private readonly planificacion: PlanificacionService) {}

  // --- Catálogo de recursos --------------------------------------------------------

  @Post('recursos')
  registrarRecurso(@Body() dto: RegistrarRecursoDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.registrarRecurso(dto, peticion.sesion!.usuarioId);
  }

  @Get('recursos')
  listarRecursos(@Query('tipo') tipo?: TipoRecurso) {
    return this.planificacion.listarRecursos(tipo);
  }

  // --- Plan de un evento ------------------------------------------------------------

  /** Paso 1: acceder a (o iniciar) la planificación logística del evento. */
  @Post('eventos/:eventoId/plan')
  obtenerOCrear(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Body() dto: CrearPlanDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.obtenerOCrear(eventoId, dto, peticion.sesion!.usuarioId);
  }

  @Get('planes/:id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.planificacion.detalle(id);
  }

  @Post('planes/:id/recursos')
  asignarRecurso(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AsignarRecursoDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.asignarRecurso(id, dto, peticion.sesion!.usuarioId);
  }

  @Delete('planes/:id/recursos/:recursoId')
  @HttpCode(200)
  quitarRecurso(@Param('id', ParseUUIDPipe) id: string, @Param('recursoId', ParseUUIDPipe) recursoId: string, @Req() peticion: PeticionConSesion) {
    return this.planificacion.quitarRecurso(id, recursoId, peticion.sesion!.usuarioId);
  }

  @Post('planes/:id/proveedores')
  asignarProveedor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AsignarProveedorDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.asignarProveedor(id, dto, peticion.sesion!.usuarioId);
  }

  @Delete('planes/:id/proveedores/:proveedorId')
  @HttpCode(200)
  quitarProveedor(@Param('id', ParseUUIDPipe) id: string, @Param('proveedorId', ParseUUIDPipe) proveedorId: string, @Req() peticion: PeticionConSesion) {
    return this.planificacion.quitarProveedor(id, proveedorId, peticion.sesion!.usuarioId);
  }

  @Post('planes/:id/personal')
  asignarPersonal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AsignarPersonalDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.asignarPersonal(id, dto, peticion.sesion!.usuarioId);
  }

  @Delete('planes/:id/personal/:empleadoId')
  @HttpCode(200)
  quitarPersonal(@Param('id', ParseUUIDPipe) id: string, @Param('empleadoId', ParseUUIDPipe) empleadoId: string, @Req() peticion: PeticionConSesion) {
    return this.planificacion.quitarPersonal(id, empleadoId, peticion.sesion!.usuarioId);
  }

  /** CU-016A. */
  @Post('planes/:id/personal-adicional')
  solicitarPersonalAdicional(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SolicitarPersonalAdicionalDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.solicitarPersonalAdicional(id, dto, peticion.sesion!.usuarioId);
  }

  /** Paso 8-10. */
  @Post('planes/:id/aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AprobarPlanDto, @Req() peticion: PeticionConSesion) {
    return this.planificacion.aprobar(id, dto, peticion.sesion!.usuarioId);
  }
}
