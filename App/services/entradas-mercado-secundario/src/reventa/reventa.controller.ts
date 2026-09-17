import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RolesPermitidos, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { UsuarioActual } from '../comun/usuario-actual.decorator';
import { CheckoutService } from './checkout.service';
import { ExpiracionService, ResultadoExpiracion } from './expiracion.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ConsultarMercadoDto, MercadoDto, PublicacionMercadoDto } from './dto/mercado.dto';
import { PagarDto, ResultadoCompraDto } from './dto/pagar.dto';
import { CambiarPrecioDto, EntradaPropiaDto, PublicacionDto, PublicarEntradaDto } from './dto/publicacion.dto';
import { PublicacionService } from './publicacion.service';

/**
 * Controlador API (SAD §9).
 *
 * Su único trabajo es recibir lo que enruta el API Gateway y delegar en el
 * Servicio de Publicación — que es, literalmente, lo que dice la vista de
 * componentes: *"Controlador API recibe y delega en Servicio de Publicación"*.
 * Aquí no hay ninguna regla de negocio.
 */
@ApiTags('reventa')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin token, o token caducado, falsificado o de una sesión cerrada' })
@ApiForbiddenResponse({ description: 'El rol de la sesión no permite esta operación' })
// RNF-06: toda ruta de este controlador exige sesión. La reventa es cosa de
// clientes (actor del CU-006); el barrido de mantenimiento lo cambia abajo.
@UseGuards(SesionValida)
@RolesPermitidos('Cliente')
@Controller('reventa')
export class ReventaController {
  constructor(
    private readonly publicacion: PublicacionService,
    private readonly checkout: CheckoutService,
    private readonly expiracion: ExpiracionService,
  ) {}

  @Post('mantenimiento/expirar-publicaciones')
  @RolesPermitidos('Administrador')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forzar el barrido de publicaciones vencidas (CU-006D)',
    description:
      'Operación de mantenimiento: hace ahora lo que el trabajo programado hace cada diez minutos. ' +
      'Existe para poder ponerse al día sin esperar al siguiente ciclo —por ejemplo si el trabajo ' +
      'falló durante la noche— y para poder probarlo. ' +
      'Solo para administradores (RNF-06): no expone datos ni cobra nada, pero tampoco es una ' +
      'operación de cliente.',
  })
  @ApiResponse({ status: 200, description: 'Cuántas publicaciones se revisaron y cuántas se expiraron' })
  expirarPublicaciones(): Promise<ResultadoExpiracion> {
    return this.expiracion.expirarVencidas();
  }

  @Get('mis-entradas')
  @ApiOperation({
    summary: 'Entradas de la cuenta del vendedor',
    description:
      'Paso 1 del CU-006. Cada entrada llega con `puedePublicarse` ya resuelto y, si no puede, ' +
      'con el código del camino que lo impide — el cliente no recalcula reglas (RNF-14).',
  })
  @ApiResponse({ status: 200, type: [EntradaPropiaDto] })
  listarMisEntradas(@UsuarioActual() usuarioId: string): Promise<EntradaPropiaDto[]> {
    return this.publicacion.listarEntradasPropias(usuarioId);
  }

  @Get('publicaciones')
  @ApiOperation({
    summary: 'Consultar el mercado secundario',
    description:
      'Paso 5 del CU-006. Devuelve solo publicaciones activas, dentro de su ventana de reventa ' +
      'y que no sean del propio solicitante.',
  })
  @ApiResponse({ status: 200, type: MercadoDto })
  consultarMercado(
    @UsuarioActual() usuarioId: string,
    @Query() filtros: ConsultarMercadoDto,
  ): Promise<MercadoDto> {
    return this.publicacion.consultarMercado(usuarioId, filtros);
  }

  @Get('publicaciones/:id')
  @ApiOperation({
    summary: 'Detalle de una publicación',
    description:
      'La otra mitad del paso 5 ("y selecciona una para comprar"). Devuelve también las que ya ' +
      'no están activas, con su estado, para poder decir "ya se vendió" en vez de un 404.',
  })
  @ApiResponse({ status: 200, type: PublicacionMercadoDto })
  @ApiResponse({ status: 404, description: 'No existe la publicación' })
  detallePublicacion(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicacionMercadoDto> {
    return this.publicacion.detallePublicacion(usuarioId, id);
  }

  @Post('publicaciones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Publicar una entrada en el mercado secundario',
    description: 'Pasos 2-4 del CU-006: validar propiedad, estado y políticas del evento, y publicar.',
  })
  @ApiResponse({ status: 201, type: PublicacionDto })
  @ApiResponse({ status: 403, description: 'La entrada no es del solicitante (pre-condición 1)' })
  @ApiResponse({ status: 409, description: 'CU-006E entrada usada/anulada · CU-006F evento sin reventa · CU-006D ventana cerrada' })
  @ApiResponse({ status: 422, description: 'El precio supera el tope de reventa' })
  publicar(@UsuarioActual() usuarioId: string, @Body() datos: PublicarEntradaDto): Promise<PublicacionDto> {
    return this.publicacion.publicar(usuarioId, datos);
  }

  @Post('publicaciones/:id/checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reservar una publicación para comprarla',
    description:
      'Paso 6 del CU-006: bloquea temporalmente la publicación en Redis (ADR-03) para que dos ' +
      'compradores no puedan pagarla a la vez, y abre la transacción. Si quien pide ya tenía un ' +
      'checkout abierto sobre esta publicación, se le devuelve el suyo en vez de rechazarlo.',
  })
  @ApiResponse({ status: 201, type: CheckoutDto })
  @ApiResponse({ status: 409, description: 'CU-006H otra persona la está comprando · publicación no activa o caducada' })
  iniciarCheckout(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CheckoutDto> {
    return this.checkout.iniciar(usuarioId, id);
  }

  @Get('checkout/:id')
  @ApiOperation({
    summary: 'Estado de un checkout',
    description: 'Incluye los segundos que le quedan a la reserva, leídos del TTL real de Redis.',
  })
  @ApiResponse({ status: 200, type: CheckoutDto })
  consultarCheckout(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CheckoutDto> {
    return this.checkout.consultar(usuarioId, id);
  }

  @Post('checkout/:id/pagar')
  // 200 y no el 201 que NestJS pone por defecto en POST: pagar no crea un
  // recurso nuevo en una URL nueva, completa la transferencia de uno existente.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pagar y completar la transferencia',
    description:
      'Pasos 7-11 del CU-006: cobra en la pasarela, transfiere la propiedad, invalida el QR ' +
      'anterior y emite uno nuevo, y registra la transferencia en el historial de propietarios. ' +
      'Recibe un token del medio de pago, nunca datos de tarjeta (RNF-05).',
  })
  @ApiResponse({ status: 200, type: ResultadoCompraDto })
  @ApiResponse({ status: 409, description: 'CU-006G el pago fue rechazado · la reserva ya no está vigente' })
  @ApiResponse({ status: 503, description: 'CU-006I no hubo respuesta de la pasarela; requiere conciliación' })
  pagar(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: PagarDto,
  ): Promise<ResultadoCompraDto> {
    return this.checkout.pagar(usuarioId, id, datos);
  }

  @Delete('checkout/:id')
  @ApiOperation({
    summary: 'Cancelar un checkout',
    description: 'Flujo alterno CU-006C. Libera el bloqueo al instante, sin esperar a que caduque.',
  })
  @ApiResponse({ status: 200, type: CheckoutDto })
  @ApiResponse({ status: 409, description: 'El checkout ya no está pendiente' })
  cancelarCheckout(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CheckoutDto> {
    return this.checkout.cancelar(usuarioId, id);
  }

  @Patch('publicaciones/:id')
  @ApiOperation({ summary: 'Cambiar el precio de una publicación', description: 'Flujo alterno CU-006A.' })
  @ApiResponse({ status: 200, type: PublicacionDto })
  @ApiResponse({ status: 409, description: 'La publicación ya no está activa' })
  @ApiResponse({ status: 422, description: 'El precio supera el tope de reventa' })
  cambiarPrecio(
    @UsuarioActual() usuarioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: CambiarPrecioDto,
  ): Promise<PublicacionDto> {
    return this.publicacion.cambiarPrecio(usuarioId, id, datos);
  }

  @Delete('publicaciones/:id')
  @ApiOperation({ summary: 'Retirar una entrada del mercado secundario', description: 'Flujo alterno CU-006B.' })
  @ApiResponse({ status: 200, type: PublicacionDto })
  @ApiResponse({ status: 409, description: 'La publicación ya no está activa' })
  retirar(@UsuarioActual() usuarioId: string, @Param('id', ParseUUIDPipe) id: string): Promise<PublicacionDto> {
    return this.publicacion.retirar(usuarioId, id);
  }
}
