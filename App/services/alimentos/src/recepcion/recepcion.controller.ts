import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { PedidoRecibidoDto, RecepcionService } from './recepcion.service';

@ApiTags('recepción de pedidos')
@ApiBearerAuth()
@UseGuards(SesionValida)
@RolesPermitidos('Personal')
@Controller('pedidos/establecimientos')
export class RecepcionController {
  constructor(private readonly recepcion: RecepcionService) {}

  @Get(':establecimientoId/pedidos')
  @ApiOperation({ summary: 'Consultar pedidos confirmados del establecimiento (solo lectura)' })
  listar(@Param('establecimientoId', ParseUUIDPipe) establecimientoId: string): Promise<PedidoRecibidoDto[]> {
    return this.recepcion.listar(establecimientoId);
  }
}
