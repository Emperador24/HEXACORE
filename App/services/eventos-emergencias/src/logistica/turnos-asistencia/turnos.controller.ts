import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CrearEmpleadoDto } from './dto/crear-empleado.dto.js';
import { CrearTurnoDto } from './dto/crear-turno.dto.js';
import { RevisarSolicitudDto } from './dto/revisar-solicitud.dto.js';
import { SolicitarCambioTurnoDto } from './dto/solicitar-cambio-turno.dto.js';
import { TurnosService } from './turnos.service.js';

@Controller()
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
  ) {
    return this.turnosService.revisarSolicitud(solicitudId, dto);
  }
}
