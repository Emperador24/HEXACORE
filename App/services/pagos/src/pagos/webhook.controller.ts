import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';
import { NotificacionPasarelaDto } from './dto/webhook.dto';
import { PublicadorPagos } from './eventos/publicador-pagos.service';
import { PagosService } from './pagos.service';

/**
 * Webhook de la pasarela (ADR-15). **Es la única ruta de Pagos que el gateway
 * expone**, y la única del sistema que no autentica con JWT: la llama la
 * pasarela, que no tiene sesión.
 *
 * ## Cómo se autentica
 *
 * Con la firma `X-Pasarela-Firma`: HMAC-SHA256 del cuerpo, con un secreto que
 * solo conocen la pasarela y Pagos. Es como lo hacen las pasarelas reales.
 * Se calcula sobre los bytes tal como llegaron (`rawBody`), y se compara en
 * tiempo constante para no filtrar la firma byte a byte por el tiempo de
 * respuesta.
 *
 * ## Por qué responde 503 si no pudo publicar
 *
 * La pasarela reintenta mientras no reciba un 2xx. Responder 204 con el evento
 * sin publicar perdería el aviso para siempre; responder 503 hace que vuelva a
 * llegar. Es la retransmisión del emisor la que da el "al menos una vez", sin
 * necesitar una bandeja de salida aquí.
 */
@ApiTags('pagos')
@Controller('pagos/webhook')
export class WebhookController {
  private readonly secreto: Buffer;

  constructor(
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
    private readonly pagos: PagosService,
    private readonly publicador: PublicadorPagos,
  ) {
    this.secreto = Buffer.from(config.pasarelaPagos.secretoWebhook);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'La pasarela confirma un cobro o un reembolso' })
  @ApiNoContentResponse({ description: 'Registrado y publicado' })
  @ApiUnauthorizedResponse({ description: 'Firma ausente o incorrecta' })
  async recibir(
    @Req() peticion: RawBodyRequest<Request>,
    @Headers('x-pasarela-firma') firma: string | undefined,
    @Body() notificacion: NotificacionPasarelaDto,
  ): Promise<void> {
    if (!this.firmaValida(peticion.rawBody, firma)) {
      throw new UnauthorizedException({ codigo: 'FIRMA_INVALIDA' });
    }

    const evento = await this.pagos.confirmar(notificacion);
    if (!(await this.publicador.publicar(evento))) {
      throw new ServiceUnavailableException({ codigo: 'BROKER_NO_DISPONIBLE' });
    }
  }

  private firmaValida(cuerpo: Buffer | undefined, firma: string | undefined): boolean {
    if (!cuerpo || !firma || !/^[0-9a-f]{64}$/.test(firma)) return false;
    const esperada = createHmac('sha256', this.secreto).update(cuerpo).digest();
    return timingSafeEqual(esperada, Buffer.from(firma, 'hex'));
  }
}
