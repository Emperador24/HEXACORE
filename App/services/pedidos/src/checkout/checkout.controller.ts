import { Body, Controller, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { UsuarioActual } from '../comun/usuario-actual.decorator';
import { CheckoutService } from './checkout.service';
import { CrearCheckoutDto } from './dto/crear-checkout.dto';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('checkout de pedidos')
@ApiBearerAuth()
@UseGuards(SesionValida)
@RolesPermitidos('Cliente')
@Controller('pedidos')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('checkout')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: 'Crear un checkout pendiente de pago, sin reservar inventario' })
  @ApiResponse({ status: 201, type: CheckoutDto })
  crear(@UsuarioActual() clienteId: string, @Body() datos: CrearCheckoutDto): Promise<CheckoutDto> {
    return this.checkout.crear(clienteId, datos);
  }
}
