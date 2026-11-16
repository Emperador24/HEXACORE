import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { validacionAlimentos } from '../../../compartido/validacion';
import { RolesPermitidos, SesionValida, PeticionConSesion } from '../comun/autenticacion/sesion-valida.guard';
import { PersonalDelEstablecimiento } from '../establecimientos/personal-establecimiento.module';
import { CancelacionService } from './cancelacion.service';
import { CancelarPedidoDto } from './cancelacion.dto';

@Controller('pedidos/establecimientos/:establecimientoId/pedidos/:pedidoId/cancelacion')
@UseGuards(SesionValida, PersonalDelEstablecimiento)
@RolesPermitidos('Personal')
@UsePipes(validacionAlimentos)
export class CancelacionController {
  constructor(private readonly servicio: CancelacionService) {}
  @Post() @HttpCode(200)
  cancelar(@Param('establecimientoId', ParseUUIDPipe) local: string, @Param('pedidoId', ParseUUIDPipe) pedido: string,
    @Headers('idempotency-key') id: string, @Body() dto: CancelarPedidoDto, @Req() r: PeticionConSesion) {
    if (typeof id !== 'string' || !isUUID(id)) throw new BadRequestException('Indica Idempotency-Key con UUID.');
    return this.servicio.cancelar(local, pedido, r.sesion!.usuarioId, id, dto);
  }
  @Get()
  consultar(@Param('establecimientoId', ParseUUIDPipe) local: string, @Param('pedidoId', ParseUUIDPipe) pedido: string, @Req() r: PeticionConSesion) {
    return this.servicio.consultar(local, pedido, r.sesion!.usuarioId);
  }
}
