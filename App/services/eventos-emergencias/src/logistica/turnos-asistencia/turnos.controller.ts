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
import {
  RolesPermitidos,
  SesionValida,
} from '../../comun/autenticacion/sesion-valida.guard.js';
import { CrearEmpleadoDto } from './dto/crear-empleado.dto.js';
import { CrearTurnoDto } from './dto/crear-turno.dto.js';
import { RevisarSolicitudDto } from './dto/revisar-solicitud.dto.js';
import { SolicitarCambioTurnoDto } from './dto/solicitar-cambio-turno.dto.js';
import { TurnosService } from './turnos.service.js';

// Todo el controlador exige sesión (RNF-06). Lo que cambia de un endpoint a
// otro es el rol: dar de alta a un empleado no es lo mismo que consultar el
// turno propio.
@UseGuards(SesionValida)
@Controller()
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  /**
   * Alta de un empleado. **Solo un administrador.**
   *
   * Un empleado no se registra a sí mismo: alguien con autoridad decide que esa
   * persona trabaja en el evento, en qué área y con qué credencial. La cuenta
   * ya debe existir (CU-027); aquí se le añade su ficha operativa.
   */
  @Post('empleados')
  @RolesPermitidos('Administrador')
  crearEmpleado(@Body() dto: CrearEmpleadoDto) {
    return this.turnosService.crearEmpleado(dto);
  }

  @Get('empleados')
  @RolesPermitidos('Administrador', 'Organizador')
  listarEmpleados() {
    return this.turnosService.listarEmpleados();
  }

  /**
   * La ficha del empleado que hace la petición: su área y su turno vigente.
   *
   * Es lo primero que consulta la app al iniciar sesión, y lo que decide qué
   * pantallas se le muestran a esa persona. Quien no es empleado recibe 404, y
   * eso también es una respuesta útil: significa "esta cuenta no trabaja aquí".
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

  /**
   * Aprobar o rechazar un cambio de turno. Quién revisa lo dice el token, no el
   * cuerpo de la petición; el servicio comprueba que sea jefe de personal.
   */
  @Patch('solicitudes-cambio/:solicitudId/revisar')
  revisarSolicitud(
    @Param('solicitudId') solicitudId: string,
    @Body() dto: RevisarSolicitudDto,
    @Req() peticion: PeticionConSesion,
  ) {
    return this.turnosService.revisarSolicitud(solicitudId, dto, peticion.sesion!);
  }
}
