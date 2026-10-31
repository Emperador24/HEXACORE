import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SesionActual, SesionRequerida } from '../sesiones/sesion-requerida.guard';
import { ContenidoToken } from '../sesiones/sesiones.service';
import { AdministracionCuentasService } from './administracion-cuentas.service';
import { AdministradorRequerido } from './administrador-requerido.guard';
import {
  ConsultarCuentasDto,
  CuentaAdministradaDto,
  DetalleCuentaDto,
  MotivoObligatorioDto,
  MotivoOpcionalDto,
  PaginaCuentasDto,
} from './dto/administracion-cuentas.dto';

/**
 * Administración de cuentas — CU-027 (*"el administrador puede además
 * activar, desactivar o eliminar cuentas"*) y CU-027B.
 *
 * Solo para administradores, comprobado contra la base en cada petición. La
 * consume el portal de administración (`portal-web-admin`).
 */
@ApiTags('administración de cuentas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sin sesión válida' })
@ApiForbiddenResponse({ description: 'Quien llama no es un administrador activo' })
@UseGuards(SesionRequerida, AdministradorRequerido)
@Controller('admin/cuentas')
export class AdministracionCuentasController {
  constructor(private readonly administracion: AdministracionCuentasService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar cuentas', description: 'Por nombre o correo, y por estado. Paginado.' })
  @ApiResponse({ status: 200, type: PaginaCuentasDto })
  listar(@Query() filtro: ConsultarCuentasDto): Promise<PaginaCuentasDto> {
    return this.administracion.listar(filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una cuenta, con su historial de administración' })
  @ApiResponse({ status: 200, type: DetalleCuentaDto })
  @ApiNotFoundResponse({ description: 'No existe esa cuenta' })
  detalle(@Param('id', ParseUUIDPipe) id: string): Promise<DetalleCuentaDto> {
    return this.administracion.detalle(id);
  }

  @Post(':id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activar o reactivar una cuenta',
    description:
      'Una cuenta **pendiente de verificar** pasa a activa sin el correo (el administrador responde ' +
      'por ella). Una **desactivada** vuelve a estar activa (CU-027B: *"hasta que sea reactivada"*). ' +
      'Una eliminada no se puede reactivar.',
  })
  @ApiResponse({ status: 200, type: CuentaAdministradaDto })
  @ApiConflictResponse({ description: 'Ya estaba activa, o fue eliminada' })
  activar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: MotivoOpcionalDto,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<CuentaAdministradaDto> {
    return this.administracion.activar(id, sesion.sub, datos.motivo);
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desactivar una cuenta (CU-027B)',
    description:
      'La persona no puede volver a iniciar sesión y **todas sus sesiones abiertas se cierran**, ' +
      'también en el resto de servicios. Exige un motivo, que queda auditado.',
  })
  @ApiResponse({ status: 200, type: CuentaAdministradaDto })
  @ApiConflictResponse({ description: 'Ya estaba desactivada' })
  @ApiUnprocessableEntityResponse({ description: 'Es tu propia cuenta, o el último administrador activo' })
  desactivar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: MotivoObligatorioDto,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<CuentaAdministradaDto> {
    return this.administracion.desactivar(id, sesion.sub, datos.motivo);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar una cuenta',
    description:
      '**Anonimiza** la cuenta: borra nombre, correo, contraseña, roles y datos de sus sesiones, y la ' +
      'deja desactivada para siempre. La fila se conserva porque otros servicios guardan su id ' +
      '(ADR-01). El correo queda libre para un registro nuevo. Exige un motivo en el cuerpo.',
  })
  @ApiResponse({ status: 200, type: CuentaAdministradaDto })
  @ApiNotFoundResponse({ description: 'No existe, o ya estaba eliminada' })
  @ApiUnprocessableEntityResponse({ description: 'Es tu propia cuenta, o el último administrador activo' })
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() datos: MotivoObligatorioDto,
    @SesionActual() sesion: ContenidoToken,
  ): Promise<CuentaAdministradaDto> {
    return this.administracion.eliminar(id, sesion.sub, datos.motivo);
  }
}
