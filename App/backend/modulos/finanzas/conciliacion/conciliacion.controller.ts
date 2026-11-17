import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { validacionAlimentos as validacion } from '../../../compartido/validacion';
import { ModuloPermisos, PeticionConSesion, RolesPermitidos, SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { AprobarReembolsoDto, SolicitarConciliacionDto } from './dto/conciliacion.dto';
import { ConciliacionService } from './conciliacion.service';

/**
 * CU-031: Gestión de Pagos y Conciliación Financiera.
 *
 * Actor «Administrador Financiero»: el sistema no tiene ese rol de cuenta
 * (CU-027), así que lo ejerce Administrador — a diferencia de CU-016/019/020,
 * aquí no se suma Organizador: la precondición 1 nombra solo este rol.
 */
@Controller('conciliacion')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Administrador')
@ModuloPermisos('reportes')
export class ConciliacionController {
  constructor(private readonly conciliacion: ConciliacionService) {}

  /** Pasos 1-2. La comparación real (pasos 3-5) corre aparte, en la cola. */
  @Post()
  solicitar(@Body() dto: SolicitarConciliacionDto, @Req() peticion: PeticionConSesion) {
    return this.conciliacion.solicitar(dto, peticion.sesion!.usuarioId);
  }

  @Get()
  listar() {
    return this.conciliacion.listar();
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.conciliacion.detalle(id);
  }

  /** Pasos 6-9. */
  @Post(':id/reembolsos')
  aprobarReembolso(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AprobarReembolsoDto, @Req() peticion: PeticionConSesion) {
    return this.conciliacion.aprobarReembolso(id, dto, peticion.sesion!.usuarioId);
  }

  @Post(':id/cerrar')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Req() peticion: PeticionConSesion) {
    return this.conciliacion.cerrar(id, peticion.sesion!.usuarioId);
  }
}
