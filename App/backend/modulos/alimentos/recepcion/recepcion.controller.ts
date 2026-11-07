import { PersonalDelEstablecimiento } from '../establecimientos/personal-establecimiento.module';
import { UsePipes } from '@nestjs/common';
import { validacionAlimentos } from '../../../compartido/validacion';
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { PedidoRecibidoDto, RecepcionService } from './recepcion.service';
import { PreparacionService } from './preparacion.service';
import { OperacionPreparacionDto } from './operacion-preparacion.dto';
import { PeticionConSesion } from '../comun/autenticacion/sesion-valida.guard';

@ApiTags('recepción de pedidos')
@ApiBearerAuth()
@UseGuards(SesionValida, PersonalDelEstablecimiento)
@RolesPermitidos('Personal')
@UsePipes(validacionAlimentos)
@Controller('pedidos/establecimientos')
export class RecepcionController {
  constructor(private readonly recepcion: RecepcionService, private readonly preparacion: PreparacionService) {}

  @Get(':establecimientoId/pedidos')
  @ApiOperation({ summary: 'Consultar avance persistido de pedidos del establecimiento' })
  listar(@Param('establecimientoId', ParseUUIDPipe) establecimientoId: string): Promise<PedidoRecibidoDto[]> {
    return this.recepcion.listar(establecimientoId);
  }
  @Get(':establecimientoId/pedidos/:pedidoId')
  detalle(@Param('establecimientoId', ParseUUIDPipe) local: string, @Param('pedidoId', ParseUUIDPipe) pedido: string) {
    return this.recepcion.detallePersonal(local, pedido);
  }
  @Post(':establecimientoId/pedidos/:pedidoId/preparacion')
  @HttpCode(200)
  operar(@Param('establecimientoId', ParseUUIDPipe) local: string, @Param('pedidoId', ParseUUIDPipe) pedido: string,
    @Headers('idempotency-key') clave: string, @Body() dto: OperacionPreparacionDto, @Req() r: PeticionConSesion) {
    if (typeof clave !== 'string' || !isUUID(clave)) throw new BadRequestException('Indica Idempotency-Key con UUID.');
    return this.preparacion.operar(local, pedido, r.sesion!.usuarioId, clave.toLowerCase(), dto);
  }
}

@ApiTags('seguimiento propio de pedidos')
@ApiBearerAuth()
@Controller('pedidos/mis-pedidos')
@UseGuards(SesionValida)
@RolesPermitidos('Cliente')
export class SeguimientoClienteController {
  constructor(private readonly recepcion: RecepcionService) {}
  @Get()
  listar(@Req() r: PeticionConSesion) { return this.recepcion.listarCliente(r.sesion!.usuarioId); }
  @Get(':pedidoId')
  detalle(@Param('pedidoId', ParseUUIDPipe) pedido: string, @Req() r: PeticionConSesion) {
    return this.recepcion.detalleCliente(r.sesion!.usuarioId, pedido);
  }
}
