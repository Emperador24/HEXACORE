import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SesionActual, SesionRequerida } from '../sesiones/sesion-requerida.guard';
import { ContenidoToken } from '../sesiones/sesiones.service';
import { CambiarContrasenaDto, EditarPerfilDto, PerfilDto } from './dto/perfil.dto';
import { MensajeDto } from './dto/recuperacion.dto';
import { PerfilService } from './perfil.service';

/**
 * Perfil propio — CU-027C.
 *
 * La ruta no lleva identificador: la cuenta es siempre la del token. Así no hay
 * forma de equivocarse —ni de intentar— editar el perfil de otra persona.
 */
@ApiTags('perfil')
@ApiBearerAuth()
@UseGuards(SesionRequerida)
@Controller('cuentas/perfil')
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  @Get()
  @ApiOperation({ summary: 'Ver el propio perfil' })
  @ApiResponse({ status: 200, type: PerfilDto })
  @ApiResponse({ status: 401, description: 'Sin sesión válida' })
  consultar(@SesionActual() sesion: ContenidoToken): Promise<PerfilDto> {
    return this.perfil.consultar(sesion);
  }

  @Patch()
  @ApiOperation({
    summary: 'Editar el propio perfil',
    description:
      'CU-027C: valida los datos antes de guardarlos. Solo el nombre es editable; el correo no ' +
      '(DECISIONES.md §14).',
  })
  @ApiResponse({ status: 200, type: PerfilDto })
  @ApiResponse({ status: 400, description: 'El nombre no es válido' })
  @ApiResponse({ status: 422, description: 'Se intentó cambiar el correo' })
  editar(@SesionActual() sesion: ContenidoToken, @Body() datos: EditarPerfilDto): Promise<PerfilDto> {
    return this.perfil.editar(sesion, datos);
  }

  @Put('contrasena')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar la contraseña',
    description:
      'Pide la actual. Los fallos cuentan para el bloqueo de CU-027D igual que en el login; al ' +
      'bloquearse se cierran todas las sesiones. Si sale bien, se cierran las demás sesiones (no ' +
      'la actual) y se avisa por correo.',
  })
  @ApiResponse({ status: 200, type: MensajeDto })
  @ApiResponse({ status: 422, description: 'Contraseña actual incorrecta, o nueva débil o repetida' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos: cuenta bloqueada y sesiones cerradas' })
  cambiarContrasena(
    @SesionActual() sesion: ContenidoToken,
    @Body() datos: CambiarContrasenaDto,
  ): Promise<MensajeDto> {
    return this.perfil.cambiarContrasena(sesion, datos);
  }
}
