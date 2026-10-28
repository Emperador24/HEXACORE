import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { UsuarioActual } from '../comun/usuario-actual.decorator';
import { EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { CrearPagoDto } from './dto/crear-pago.dto';
import { PagoDto } from './dto/pago.dto';
import { PagosService } from './pagos.service';

@ApiTags('pagos de pedidos')
@ApiBearerAuth()
@UseGuards(SesionValida)
@RolesPermitidos('Cliente')
@Controller('pedidos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Post(':pedidoId/pagos')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true,
    validationError: { target: false, value: false } }))
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ summary: 'Procesar un pago y confirmar el pedido descontando el inventario reservado' })
  @ApiResponse({ status: 200, type: PagoDto })
  @ApiResponse({ status: 202, type: PagoDto })
  @ApiResponse({ status: 502, type: PagoDto })
  @ApiResponse({ status: 504, type: PagoDto })
  async pagar(
    @UsuarioActual() clienteId: string,
    @Param('pedidoId', new ParseUUIDPipe()) pedidoId: string,
    @Headers('idempotency-key') clave: string,
    @Body() entrada: CrearPagoDto,
  ): Promise<PagoDto> {
    await new ParseUUIDPipe().transform(clave, { type: 'custom' });
    const resultado = await this.pagos.pagar(clienteId, pedidoId, clave, entrada.tokenPago);
    if (resultado.estadoPago === EstadoTransaccionPedido.PENDIENTE) throw new HttpException(resultado, HttpStatus.ACCEPTED);
    if (resultado.estadoPago === EstadoTransaccionPedido.FALLIDA) {
      throw new HttpException(resultado, resultado.codigo === 'PASARELA_TIMEOUT' ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY);
    }
    return resultado;
  }
}
