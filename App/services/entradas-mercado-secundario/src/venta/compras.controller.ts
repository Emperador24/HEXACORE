import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { UsuarioActual } from '../comun/usuario-actual.decorator';
import { PagarDto } from '../reventa/dto/pagar.dto';
import { CancelacionService } from './cancelacion.service';
import { CompraService } from './compra.service';
import {
  CancelacionDto,
  CancelarCompraDto,
  CotizacionCancelacionDto,
  CotizarCancelacionDto,
} from './dto/cancelacion.dto';
import { AplicarCuponDto, CompraDto, CrearCompraDto } from './dto/compra.dto';
import { PromocionesService } from './promociones.service';

/**
 * Compras de la venta primaria: CU-001 (comprar), CU-004 (cupón) y CU-003
 * (cancelar). Todo cuelga de la compra porque las tres cosas ocurren sobre
 * ella: se reserva, se le aplica un cupón, se paga y, después, se cancela.
 *
 * Exige sesión con rol Cliente: la pre-condición 2 del CU-001 es *"que el
 * usuario esté autenticado"*, y el CU-003 pide *"validar que la solicitud
 * provenga del titular de la compra"*.
 */
@ApiTags('compras')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin token, o token caducado, falsificado o de una sesión cerrada' })
@ApiForbiddenResponse({ description: 'El rol de la sesión no permite esta operación' })
@UseGuards(SesionValida)
@RolesPermitidos('Cliente')
@Controller('compras')
export class ComprasController {
  constructor(
    private readonly compras: CompraService,
    private readonly promociones: PromocionesService,
    private readonly cancelaciones: CancelacionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reservar entradas (iniciar una compra)',
    description:
      'Pasos 3-4 del CU-001: aparta el cupo de la localidad y calcula el total. La reserva dura ' +
      '`COMPRA_RESERVA_MINUTOS` (CU-001B). Sin cupo, responde CU-001A.',
  })
  @ApiResponse({ status: 201, type: CompraDto })
  @ApiResponse({ status: 409, description: 'CU-001A sin disponibilidad · el evento no está a la venta' })
  reservar(@UsuarioActual() usuarioId: string, @Body() datos: CrearCompraDto): Promise<CompraDto> {
    return this.compras.reservar(usuarioId, datos);
  }

  @Get()
  @ApiOperation({ summary: 'Mis compras', description: 'Las 50 más recientes, sin sus entradas.' })
  @ApiResponse({ status: 200, type: [CompraDto] })
  listar(@UsuarioActual() usuarioId: string): Promise<CompraDto[]> {
    return this.compras.listar(usuarioId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una compra',
    description: 'Con sus entradas y códigos QR, solo las que siguen siendo del usuario (una revendida ya no lo es).',
  })
  @ApiResponse({ status: 200, type: CompraDto })
  @ApiResponse({ status: 404, description: 'No existe esa compra en tu cuenta' })
  detalle(@UsuarioActual() usuarioId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CompraDto> {
    return this.compras.detalle(usuarioId, id);
  }

  @Post(':id/pagar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pagar la compra y recibir las entradas',
    description:
      'Pasos 5-8 del CU-001: cobra en la pasarela y emite una entrada con su QR por cada cupo. ' +
      'Recibe un token del medio de pago, nunca datos de tarjeta (RNF-05). Reintentar es seguro.',
  })
  @ApiResponse({ status: 200, type: CompraDto })
  @ApiResponse({ status: 409, description: 'CU-001B reserva vencida · CU-001C pago rechazado (se puede reintentar)' })
  @ApiResponse({ status: 503, description: 'La pasarela no respondió; reintentar es seguro' })
  pagar(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() pago: PagarDto,
  ): Promise<CompraDto> {
    return this.compras.pagar(usuarioId, id, pago);
  }

  @Put(':id/cupon')
  @ApiOperation({
    summary: 'Aplicar un código promocional',
    description: 'CU-004: valida el código, reserva un uso y recalcula el total. Uno por compra.',
  })
  @ApiResponse({ status: 200, type: CompraDto })
  @ApiResponse({ status: 409, description: 'CU-004D sin usos disponibles · la compra ya tiene un código' })
  @ApiResponse({ status: 422, description: 'CU-004C código inválido · CU-004A no aplica a esta localidad' })
  aplicarCupon(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: AplicarCuponDto,
  ): Promise<CompraDto> {
    return this.promociones.aplicar(usuarioId, id, datos.codigo);
  }

  @Delete(':id/cupon')
  @ApiOperation({ summary: 'Quitar el código promocional', description: 'CU-004B: recalcula el total sin descuento.' })
  @ApiResponse({ status: 200, type: CompraDto })
  quitarCupon(@UsuarioActual() usuarioId: string, @Param('id', ParseUUIDPipe) id: string): Promise<CompraDto> {
    return this.promociones.quitar(usuarioId, id);
  }

  @Post(':id/cancelacion/cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cotizar la cancelación',
    description:
      'Pasos 2-4 del CU-003: qué entradas se pueden cancelar y cuánto se devolvería, sin cambiar nada. ' +
      'Informa si el reembolso es parcial (CU-003A) y qué entradas no se pueden cancelar (CU-003D).',
  })
  @ApiResponse({ status: 200, type: CotizacionCancelacionDto })
  @ApiResponse({ status: 409, description: 'Fuera de plazo · la compra no está pagada · CU-003D ninguna cancelable' })
  cotizarCancelacion(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CotizarCancelacionDto,
  ): Promise<CotizacionCancelacionDto> {
    return this.cancelaciones.cotizar(usuarioId, id, datos.entradaIds);
  }

  @Post(':id/cancelaciones')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar entradas y pedir el reembolso',
    description:
      'Pasos 5-9 del CU-003: con el monto que el usuario aceptó en la cotización, reembolsa, anula ' +
      'las entradas e invalida sus QR. Puede ser solo algunas entradas (CU-003B).',
  })
  @ApiResponse({ status: 200, type: CancelacionDto })
  @ApiResponse({ status: 409, description: 'CU-003C reembolso rechazado (las entradas siguen activas) · el monto cambió' })
  @ApiResponse({ status: 503, description: 'La pasarela no respondió; requiere conciliación' })
  cancelar(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CancelarCompraDto,
  ): Promise<CancelacionDto> {
    return this.cancelaciones.cancelar(usuarioId, id, datos);
  }
}
