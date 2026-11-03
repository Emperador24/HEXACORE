import { UsePipes } from '@nestjs/common';
import { validacionLogistica } from '../../../compartido/validacion';
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import type { PeticionDeLogistica } from './autorizacion.guard';
import {
  ContextoDeLogistica,
  SoloQuienSupervisa,
} from './autorizacion.guard';
import { AsignarPersonalDto } from './dto/asignar-personal.dto';
import { CrearZonaEventoDto } from './dto/crear-zona-evento.dto';
import { PersonalOperativoService } from './personal-operativo.service';

/**
 * CU-017: Asignar personal operativo (Coordinador Logístico).
 *
 * El controlador entero queda cerrado a quien supervisa: definir zonas,
 * asignar personal y reasignar turnos son decisiones de quien coordina, no
 * cosas que un empleado haga sobre sus compañeros.
 */
@UsePipes(validacionLogistica)
@Controller('logistica')
@UseGuards(SesionValida, ContextoDeLogistica, SoloQuienSupervisa)
export class PersonalOperativoController {
  constructor(private readonly personalOperativo: PersonalOperativoService) {}

  @Post('zonas')
  crearZona(@Body() dto: CrearZonaEventoDto) {
    return this.personalOperativo.crearZona(dto);
  }

  @Get('zonas')
  listarZonas(@Query('eventoId') eventoId: string) {
    return this.personalOperativo.listarZonas(eventoId);
  }

  @Get('personal-disponible')
  personalDisponible(@Query('eventoId') eventoId: string, @Query('rol') rol?: string) {
    return this.personalOperativo.personalDisponible(eventoId, rol);
  }

  @Post('zonas/:zonaId/asignaciones')
  asignarPersonal(
    @Param('zonaId') zonaId: string,
    @Body() dto: AsignarPersonalDto,
    @Req() peticion: PeticionDeLogistica,
  ) {
    return this.personalOperativo.asignarPersonal(zonaId, dto, peticion.sesion!.usuarioId);
  }

  @Patch('turnos/:turnoId/reasignar')
  reasignar(
    @Param('turnoId') turnoId: string,
    @Body() dto: AsignarPersonalDto,
    @Req() peticion: PeticionDeLogistica,
  ) {
    return this.personalOperativo.reasignar(turnoId, dto, peticion.sesion!.usuarioId);
  }
}
