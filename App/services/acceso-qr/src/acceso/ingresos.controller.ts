import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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
import {
  CacheQrDto,
  IngresoAutorizadoDto,
  SincronizacionDto,
  SincronizarIngresosDto,
  ValidarQrDto,
} from './dto/ingreso.dto';
import { IngresoService } from './ingreso.service';

/**
 * Validación de QR en el ingreso (CU-002). El actor es el **personal de
 * ingreso** (rol `Personal`), desde la app móvil; un administrador también
 * puede, para cubrir una puerta.
 */
@ApiTags('ingresos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin token, o token caducado, falsificado o de una sesión cerrada' })
@ApiForbiddenResponse({ description: 'Solo el personal de ingreso valida entradas' })
@UseGuards(SesionValida)
@RolesPermitidos('Personal', 'Administrador')
@Controller('ingresos')
export class IngresosController {
  constructor(private readonly ingresos: IngresoService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar un QR y registrar el ingreso',
    description:
      'Pasos 2-10 del CU-002: verifica que la entrada sea de este evento y no se haya usado, ' +
      'comprueba el aforo, registra la hora y marca el QR como usado.',
  })
  @ApiResponse({ status: 200, type: IngresoAutorizadoDto })
  @ApiResponse({ status: 404, description: 'CU-002A QR inválido, de otro evento o anulado' })
  @ApiResponse({ status: 409, description: 'CU-002D ya utilizado · CU-002B aforo completo' })
  validar(@UsuarioActual() personalId: string, @Body() datos: ValidarQrDto): Promise<IngresoAutorizadoDto> {
    return this.ingresos.validar(personalId, datos);
  }

  @Get('eventos/:eventoId/cache')
  @ApiOperation({
    summary: 'Caché de QR válidos para operar sin conexión',
    description: 'CU-002E: los hashes SHA-256 de los QR que hoy pueden ingresar. Los códigos no viajan.',
  })
  @ApiResponse({ status: 200, type: CacheQrDto })
  cache(@Param('eventoId', ParseUUIDPipe) eventoId: string): Promise<CacheQrDto> {
    return this.ingresos.cache(eventoId);
  }

  @Post('sincronizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincronizar ingresos hechos sin conexión',
    description:
      'CU-002E: registra los ingresos validados contra la caché local. Lo que no pase las reglas vuelve ' +
      'como conflicto para revisar, no se descarta.',
  })
  @ApiResponse({ status: 200, type: SincronizacionDto })
  sincronizar(@UsuarioActual() personalId: string, @Body() datos: SincronizarIngresosDto): Promise<SincronizacionDto> {
    return this.ingresos.sincronizar(personalId, datos);
  }
}
