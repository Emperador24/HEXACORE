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
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import type { PeticionDeLogistica } from './autorizacion.guard.js';
import {
  ContextoDeLogistica,
  SoloQuienSupervisa,
} from './autorizacion.guard.js';
import { CrearEmpleadoDto } from './dto/crear-empleado.dto.js';
import { CrearTurnoDto } from './dto/crear-turno.dto.js';
import { RevisarSolicitudDto } from './dto/revisar-solicitud.dto.js';
import { SolicitarCambioTurnoDto } from './dto/solicitar-cambio-turno.dto.js';
import { TurnosService } from './turnos.service.js';

@Controller('logistica')
@UseGuards(SesionValida, ContextoDeLogistica)
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  @Post('empleados')
  @UseGuards(SoloQuienSupervisa)
  crearEmpleado(@Body() dto: CrearEmpleadoDto) {
    return this.turnosService.crearEmpleado(dto);
  }

  // La lista completa del personal incluye la credencial de cada uno (que es
  // su correo): no es algo que deba ver un compañero cualquiera.
  @Get('empleados')
  @UseGuards(SoloQuienSupervisa)
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
  async miFicha(@Req() peticion: PeticionDeLogistica) {
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
  @UseGuards(SoloQuienSupervisa)
  crearTurno(@Body() dto: CrearTurnoDto) {
    return this.turnosService.crearTurno(dto);
  }

  /**
   * Los turnos que le corresponde ver a quien pregunta: todos si supervisa,
   * los suyos si no.
   *
   * Son dos métodos del servicio y no uno con parámetro opcional a propósito:
   * con `listarTurnos(empleadoId?)`, un `undefined` accidental —el caso de
   * quien no tiene ficha— devuelve los turnos de todo el mundo. Aquí el caso
   * por defecto es no ver nada.
   */
  @Get('turnos')
  listarTurnos(@Req() peticion: PeticionDeLogistica) {
    if (peticion.supervisa) return this.turnosService.listarTurnos();
    return this.turnosService.turnosDeEmpleado(peticion.empleado?.id ?? null);
  }

  @Post('turnos/:turnoId/solicitudes-cambio')
  solicitarCambio(
    @Param('turnoId') turnoId: string,
    @Body() dto: SolicitarCambioTurnoDto,
    @Req() peticion: PeticionDeLogistica,
  ) {
    // Quién pide el cambio lo dice la sesión, no la URL: sin esto, cualquiera
    // podía pedir el cambio del turno de otro con solo conocer su id.
    return this.turnosService.solicitarCambio(turnoId, dto, {
      empleadoId: peticion.empleado?.id ?? null,
      supervisa: peticion.supervisa ?? false,
    });
  }

  @Get('solicitudes-cambio')
  listarSolicitudes(
    @Req() peticion: PeticionDeLogistica,
    @Query('estado') estado?: string,
  ) {
    if (peticion.supervisa) return this.turnosService.listarSolicitudes(estado);
    return this.turnosService.solicitudesDeEmpleado(
      peticion.empleado?.id ?? null,
      estado,
    );
  }

  @Patch('solicitudes-cambio/:solicitudId/revisar')
  @UseGuards(SoloQuienSupervisa)
  revisarSolicitud(
    @Param('solicitudId') solicitudId: string,
    @Body() dto: RevisarSolicitudDto,
    @Req() peticion: PeticionDeLogistica,
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
