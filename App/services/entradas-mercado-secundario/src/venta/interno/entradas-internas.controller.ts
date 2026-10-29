import { Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard';
import { EntradaValidadaDto, MarcarUsadaDto, RevertirUsoDto } from './dto/interno.dto';
import { EntradasInternasService, QrValido, ResultadoValidacion } from './entradas-internas.service';

/** Cómo se cuenta cada negativa hacia fuera. El 409 dice "existe pero no vale ahora". */
const MOTIVOS: Record<Exclude<ResultadoValidacion, ResultadoValidacion.OK>, string> = {
  [ResultadoValidacion.QR_DESCONOCIDO]: 'QR_DESCONOCIDO',
  [ResultadoValidacion.OTRO_EVENTO]: 'OTRO_EVENTO',
  [ResultadoValidacion.YA_UTILIZADA]: 'YA_UTILIZADA',
  [ResultadoValidacion.ANULADA]: 'ANULADA',
  [ResultadoValidacion.EN_REVENTA]: 'EN_REVENTA',
};

/**
 * API interna sobre `Entrada`. **No se enruta en el gateway.**
 *
 * La llama Acceso QR, que ya no puede tocar la tabla por su cuenta. Autentica
 * igual que todo lo demás: que solo sea alcanzable desde dentro de la red no
 * es un control de acceso (RNF-06).
 */
@ApiTags('interno')
@ApiBearerAuth()
@UseGuards(SesionValida)
@Controller('interno/entradas')
export class EntradasInternasController {
  constructor(private readonly entradas: EntradasInternasService) {}

  @Post('marcar-usada')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gasta el QR de una entrada válida de este evento' })
  @ApiOkResponse({ type: EntradaValidadaDto })
  @ApiConflictResponse({ description: 'La entrada existe pero no se puede usar ahora' })
  async marcarUsada(@Body() dto: MarcarUsadaDto): Promise<EntradaValidadaDto> {
    const validada = await this.entradas.marcarUsada(dto.codigoQr, dto.eventoId);

    if (validada.resultado === ResultadoValidacion.QR_DESCONOCIDO) {
      throw new NotFoundException({ codigo: MOTIVOS[ResultadoValidacion.QR_DESCONOCIDO] });
    }
    if (validada.resultado !== ResultadoValidacion.OK) {
      // El id va en el cuerpo del 409 a propósito: con él, Acceso QR puede
      // decirle al personal cuándo y por dónde se usó (CU-002D).
      throw new ConflictException({ codigo: MOTIVOS[validada.resultado], entradaId: validada.entradaId });
    }

    return {
      entradaId: validada.entradaId as string,
      numeroTicket: validada.numeroTicket as string,
      localidadNombre: validada.localidadNombre as string,
      propietarioId: validada.propietarioId as string,
    };
  }

  @Post('revertir-uso')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Compensación: devuelve la entrada a VALIDA' })
  async revertirUso(@Body() dto: RevertirUsoDto): Promise<void> {
    await this.entradas.revertirUso(dto.entradaId);
  }

  @Get('eventos/:eventoId/qr-validos')
  @ApiOperation({ summary: 'Hashes de los QR válidos del evento, para validar sin red (CU-002E)' })
  qrValidos(@Param('eventoId', ParseUUIDPipe) eventoId: string): Promise<QrValido[]> {
    return this.entradas.qrValidos(eventoId);
  }
}
