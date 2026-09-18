import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { PeticionConSesion } from '../../comun/autenticacion/sesion-valida.guard.js';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import { CrearEmpleadoDto } from './dto/crear-empleado.dto.js';
import { CrearTurnoDto } from './dto/crear-turno.dto.js';
import { RevisarSolicitudDto } from './dto/revisar-solicitud.dto.js';
import { SolicitarCambioTurnoDto } from './dto/solicitar-cambio-turno.dto.js';
import { TurnosService } from './turnos.service.js';

@Controller('logistica')
@UseGuards(SesionValida)
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  @Post('empleados')
  crearEmpleado(@Body() dto: CrearEmpleadoDto) {
    return this.turnosService.crearEmpleado(dto);
  }

  @Get('empleados')
  listarEmpleados() {
    return this.turnosService.listarEmpleados();
  }

  @Post('turnos')
  crearTurno(@Body() dto: CrearTurnoDto) {
    return this.turnosService.crearTurno(dto);
  }

  @Get('turnos')
  listarTurnos() {
    return this.turnosService.listarTurnos();
  }

  @Post('turnos/:turnoId/solicitudes-cambio')
  solicitarCambio(
    @Param('turnoId') turnoId: string,
    @Body() dto: SolicitarCambioTurnoDto,
  ) {
    return this.turnosService.solicitarCambio(turnoId, dto);
  }

  @Get('solicitudes-cambio')
  listarSolicitudes(@Query('estado') estado?: string) {
    return this.turnosService.listarSolicitudes(estado);
  }

  @Patch('solicitudes-cambio/:solicitudId/revisar')
  revisarSolicitud(
    @Param('solicitudId') solicitudId: string,
    @Body() dto: RevisarSolicitudDto,
    @Req() peticion: PeticionConSesion,
  ) {
    // El supervisor que revisa es quien tiene la sesión, no lo que diga el
    // cuerpo de la petición — de lo contrario cualquiera podría aprobar su
    // propio cambio de turno declarándose supervisor.
    return this.turnosService.revisarSolicitud(solicitudId, {
      ...dto,
      supervisorId: peticion.sesion!.usuarioId,
    });
  }
}
