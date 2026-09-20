import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * La ficha del empleado que hace la petición: su área y su turno vigente.
   *
   * Es lo primero que consulta la app al iniciar sesión, y lo que decide qué
   * pantallas se le muestran. Quien no es empleado recibe 404, y eso también
   * es una respuesta útil: significa "esta cuenta no trabaja aquí".
   *
   * Va **antes** que cualquier ruta `empleados/:id`: Nest resuelve por orden de
   * declaración y `yo` se colaría como identificador.
   */
  @Get('empleados/yo')
  async miFicha(@Req() peticion: PeticionConSesion) {
    const ficha = await this.turnosService.fichaDeUsuario(peticion.sesion!.usuarioId);
    if (!ficha) {
      throw new NotFoundException({
        codigo: 'SIN_FICHA_DE_EMPLEADO',
        mensaje:
          'Tu cuenta no está dada de alta como empleado. Pídele a un administrador que te registre.',
      });
    }
    return ficha;
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
