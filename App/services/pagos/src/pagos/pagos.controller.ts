import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { CobrarDto, ReembolsarDto, RespuestaPagoDto } from './dto/pagos.dto';
import { PagosService } from './pagos.service';

/**
 * API del microservicio de Pagos.
 *
 * **No se expone por el API Gateway**: ningún cliente llama aquí. Quienes
 * llaman son Ventas, Postventa y Alimentos, que reenvían el token del usuario.
 * Que no esté enrutado desde fuera no lo exime de autenticar: la guardia sigue
 * puesta, porque la red no es un control de acceso (RNF-06).
 */
@ApiTags('pagos')
@ApiBearerAuth()
@UseGuards(SesionValida)
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cobra, o devuelve el resultado del primer intento con esa clave' })
  @ApiOkResponse({ type: RespuestaPagoDto })
  @ApiConflictResponse({ description: 'La clave ya se usó para otra operación' })
  cobrar(@Body() dto: CobrarDto): Promise<RespuestaPagoDto> {
    return this.pagos.cobrar(dto);
  }

  @Post('reembolsos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reembolsa un cobro aprobado (CU-003)' })
  @ApiOkResponse({ type: RespuestaPagoDto })
  reembolsar(@Body() dto: ReembolsarDto): Promise<RespuestaPagoDto> {
    return this.pagos.reembolsar(dto);
  }
}
