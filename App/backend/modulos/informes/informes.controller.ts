import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { validacionAlimentos as validacion } from '../../compartido/validacion';
import { ModuloPermisos, RolesPermitidos, SesionValida } from './comun/autenticacion/sesion-valida.guard';
import { CompararEventosDto, ConsultarDashboardDto, ExportarInformeDto } from './dto/informes.dto';
import { InformesService } from './informes.service';

/**
 * CU-032: Gestión de Reportes y Analítica del Evento.
 *
 * El SRS nombra Organizador y Administrador como actores (a diferencia de
 * CU-031, que solo nombra Administrador): aquí sí se suman ambos.
 */
@Controller('informes')
@UsePipes(validacion)
@UseGuards(SesionValida)
@RolesPermitidos('Organizador', 'Administrador')
@ModuloPermisos('reportes')
export class InformesController {
  constructor(private readonly informes: InformesService) {}

  /** CU-032B: la ruta literal va antes de `:eventoId` para no perder frente a su comodín. */
  @Get('comparativo')
  comparativo(@Query() dto: CompararEventosDto) {
    return this.informes.comparativo(dto.eventos.split(','), dto);
  }

  /** CU-032, pasos 1-5. */
  @Get(':eventoId')
  dashboard(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query() dto: ConsultarDashboardDto) {
    return this.informes.dashboard(eventoId, dto);
  }

  /** CU-032, pasos 7-8. */
  @Get(':eventoId/exportar')
  async exportar(@Param('eventoId', ParseUUIDPipe) eventoId: string, @Query() dto: ExportarInformeDto, @Res({ passthrough: true }) respuesta: Response) {
    const archivo = await this.informes.exportar(eventoId, dto, dto.formato ?? 'csv');
    respuesta.set({ 'Content-Type': archivo.contentType, 'Content-Disposition': `attachment; filename="${archivo.nombreArchivo}"` });
    return new StreamableFile(Buffer.from(archivo.contenido, 'utf8'));
  }
}
