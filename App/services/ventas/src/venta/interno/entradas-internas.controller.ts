import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlamadaInterna } from './llamada-interna.guard';
import { EntradaIdDto, MarcarEnReventaDto, TransferenciaDto, TransferirDto } from './dto/interno.dto';
import { EntradasInternasService, MotivoNoRevendible } from './entradas-internas.service';

/**
 * API interna sobre `Entrada`. **No se enruta en el gateway.**
 *
 * La llama Postventa, que no puede tocar la tabla por su cuenta. Acceso QR ya
 * no (ADR-15): la puerta valida contra su propia copia de los QR, que le llega
 * por eventos. Autentica igual que todo lo demás: que solo sea alcanzable
 * desde dentro de la red no es un control de acceso (RNF-06).
 */
@ApiTags('interno')
@ApiBearerAuth()
@UseGuards(LlamadaInterna)
@Controller('interno/entradas')
export class EntradasInternasController {
  constructor(private readonly entradas: EntradasInternasService) {}

  @Get('de/:propietarioId')
  @ApiOperation({ summary: 'Las entradas de una persona. La usa Postventa en el paso 1 del CU-006' })
  async entradasDe(@Param('propietarioId', ParseUUIDPipe) propietarioId: string) {
    return { entradas: await this.entradas.entradasDe(propietarioId) };
  }

  @Post('marcar-en-reventa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pone la entrada EN_REVENTA si es de quien dice y está disponible' })
  @ApiConflictResponse({ description: 'No está disponible para revender (usada, anulada o ya publicada)' })
  async marcarEnReventa(@Body() dto: MarcarEnReventaDto) {
    const resultado = await this.entradas.marcarEnReventa(dto.entradaId, dto.propietarioId);
    if (resultado.marcada) return resultado.entrada;

    // Cada negativa con su propio código, porque el CU-006 tiene un camino
    // distinto para cada una y Postventa las traduce a respuestas distintas.
    // Devolver un 409 genérico obligaría a quien llama a adivinar.
    switch (resultado.motivo) {
      case MotivoNoRevendible.NO_EXISTE:
        throw new NotFoundException({ codigo: 'ENTRADA_NO_ENCONTRADA' });
      case MotivoNoRevendible.NO_ES_SUYA:
        throw new ForbiddenException({ codigo: 'NO_ES_PROPIETARIO' });
      default:
        throw new ConflictException({ codigo: 'ENTRADA_NO_REVENDIBLE', estado: resultado.estado });
    }
  }

  @Post('devolver-de-reventa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devuelve la entrada a su dueño: retiro, expiración o compensación' })
  async devolverDeReventa(@Body() dto: EntradaIdDto): Promise<{ devuelta: boolean }> {
    return { devuelta: await this.entradas.devolverDeReventa(dto.entradaId) };
  }

  @Post('transferir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia el dueño, emite el QR nuevo y escribe el historial, en una transacción' })
  @ApiOkResponse({ type: TransferenciaDto })
  transferir(@Body() dto: TransferirDto): Promise<TransferenciaDto> {
    return this.entradas.transferir(dto);
  }
}
