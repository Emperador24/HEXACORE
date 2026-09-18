import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import { AsignarPersonalDto } from './dto/asignar-personal.dto.js';
import { CrearZonaEventoDto } from './dto/crear-zona-evento.dto.js';
import { PersonalOperativoService } from './personal-operativo.service.js';

/** CU-017: Asignar personal operativo (Coordinador Logístico). */
@Controller('logistica')
@UseGuards(SesionValida)
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
  asignarPersonal(@Param('zonaId') zonaId: string, @Body() dto: AsignarPersonalDto) {
    return this.personalOperativo.asignarPersonal(zonaId, dto);
  }

  @Patch('turnos/:turnoId/reasignar')
  reasignar(@Param('turnoId') turnoId: string, @Body() dto: AsignarPersonalDto) {
    return this.personalOperativo.reasignar(turnoId, dto);
  }
}
