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
import {
  EntradaIdDto,
  MarcarEnReventaDto,
  EntradaValidadaDto,
  MarcarUsadaDto,
  RevertirUsoDto,
  TransferenciaDto,
  TransferirDto,
} from './dto/interno.dto';
import {
  EntradasInternasService,
  MotivoNoRevendible,
  QrValido,
  ResultadoValidacion,
} from './entradas-internas.service';

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
@UseGuards(LlamadaInterna)
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
