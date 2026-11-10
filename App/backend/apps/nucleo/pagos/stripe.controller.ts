import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PagosService, ResultadoCobro, TipoOperacion } from '../../../modulos/finanzas/pagos';
import { CONFIGURACION as CONFIGURACION_PAGOS, ConfiguracionServicio as ConfiguracionPagos } from '../../../modulos/finanzas/pagos/config/configuracion';
import { PublicadorPagos } from './publicador-pagos.service';

/** Cuánto puede tardar en llegar un webhook firmado antes de tomarlo por repetición maliciosa. */
const TOLERANCIA_SEGUNDOS = 300;

interface EventoStripe {
  type?: string;
  data?: {
    object?: {
      id?: string;
      object?: string;
      status?: string;
      payment_intent?: string | null;
      metadata?: { claveIdempotencia?: string; operacion?: string };
      last_payment_error?: { message?: string } | null;
      failure_reason?: string | null;
    };
  };
}

/**
 * Lo que el portal necesita saber para pagar: si la pasarela es Stripe y con
 * qué llave pública monta el formulario de tarjeta. Es pública a propósito
 * (la llave `pk_` está hecha para ir al navegador) y nunca devuelve la secreta.
 */
@ApiTags('pagos')
@Controller('pagos/configuracion')
export class ConfiguracionPagosController {
  constructor(@Inject(CONFIGURACION_PAGOS) private readonly config: ConfiguracionPagos) {}

  @Get()
  @ApiOperation({ summary: 'Proveedor de pagos y llave pública para el formulario de tarjeta' })
  @ApiOkResponse({ description: '{ proveedor: "stripe" | "simulada", clavePublica }' })
  consultar(): { proveedor: 'stripe' | 'simulada'; clavePublica: string | null } {
    const { proveedor, stripe } = this.config.pasarelaPagos;
    return { proveedor, clavePublica: proveedor === 'stripe' ? stripe.clavePublica : null };
  }
}

/**
 * Webhook de Stripe: la vía por la que se resuelve un cobro o reembolso que
 * quedó INDETERMINADO (timeout, `processing`), igual que el webhook de la
 * pasarela simulada (ADR-15) y con el mismo `PagosService.confirmar`.
 *
 * Se autentica con la cabecera `Stripe-Signature`: HMAC-SHA256 de
 * `"<t>.<cuerpo>"` con el secreto `whsec_…`, sobre los bytes tal como llegaron
 * y comparado en tiempo constante. Un evento sin `metadata.claveIdempotencia`
 * no es de una operación de HEXACORE y se ignora con 204.
 *
 * En local, la Stripe CLI reenvía los eventos sin dirección pública:
 *   stripe listen --forward-to localhost:8080/api/v1/pagos/webhook/stripe
 */
@ApiTags('pagos')
@Controller('pagos/webhook/stripe')
export class WebhookStripeController {
  private readonly log = new Logger(WebhookStripeController.name);

  constructor(
    @Inject(CONFIGURACION_PAGOS) private readonly config: ConfiguracionPagos,
    private readonly pagos: PagosService,
    private readonly publicador: PublicadorPagos,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stripe confirma un cobro o un reembolso' })
  @ApiNoContentResponse({ description: 'Registrado y publicado, o ignorado por no ser de HEXACORE' })
  @ApiUnauthorizedResponse({ description: 'Firma ausente o incorrecta' })
  async recibir(
    @Req() peticion: RawBodyRequest<Request>,
    @Headers('stripe-signature') firma: string | undefined,
  ): Promise<void> {
    const secreto = this.config.pasarelaPagos.stripe.secretoWebhook;
    if (this.config.pasarelaPagos.proveedor !== 'stripe' || !secreto) {
      throw new NotFoundException({ codigo: 'WEBHOOK_STRIPE_NO_CONFIGURADO' });
    }
    if (!firmaStripeValida(peticion.rawBody, firma, secreto, Date.now())) {
      throw new UnauthorizedException({ codigo: 'FIRMA_INVALIDA' });
    }

    const notificacion = traducirEvento(JSON.parse(peticion.rawBody!.toString('utf8')) as EventoStripe);
    if (!notificacion) return;

    const evento = await this.pagos.confirmar(notificacion);
    this.log.log(`Stripe confirmó ${notificacion.operacion} ${notificacion.claveIdempotencia}: ${notificacion.resultado}`);
    // Mismo criterio que el otro webhook: sin publicar no se responde 2xx, y
    // Stripe lo vuelve a mandar.
    if (!(await this.publicador.publicar(evento))) {
      throw new ServiceUnavailableException({ codigo: 'BROKER_NO_DISPONIBLE' });
    }
  }
}

/** `Stripe-Signature: t=<segundos>,v1=<hex>[,v1=…]`. Exportada para las pruebas. */
export function firmaStripeValida(cuerpo: Buffer | undefined, cabecera: string | undefined, secreto: string, ahoraMs: number): boolean {
  if (!cuerpo || !cabecera) return false;
  const partes = cabecera.split(',').map((p) => p.trim().split('=') as [string, string]);
  const t = partes.find(([k]) => k === 't')?.[1];
  const firmas = partes.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/.test(v ?? '')).map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || firmas.length === 0) return false;
  if (Math.abs(ahoraMs / 1000 - Number(t)) > TOLERANCIA_SEGUNDOS) return false;
  const esperada = createHmac('sha256', secreto).update(`${t}.`).update(cuerpo).digest();
  return firmas.some((f) => timingSafeEqual(esperada, Buffer.from(f, 'hex')));
}

/** De un evento de Stripe a la notificación del dominio; `null` si no hay nada que confirmar. */
export function traducirEvento(evento: EventoStripe) {
  const objeto = evento.data?.object;
  const clave = objeto?.metadata?.claveIdempotencia;
  if (!objeto || !clave) return null;

  const notificar = (operacion: TipoOperacion, resultado: ResultadoCobro.APROBADO | ResultadoCobro.RECHAZADO, motivo: string | null) => ({
    claveIdempotencia: clave,
    operacion,
    resultado,
    referencia: objeto.id ?? null,
    motivo: motivo?.slice(0, 120) ?? null,
  });

  switch (evento.type) {
    case 'payment_intent.succeeded':
      return notificar(TipoOperacion.COBRO, ResultadoCobro.APROBADO, null);
    case 'payment_intent.payment_failed':
      return notificar(TipoOperacion.COBRO, ResultadoCobro.RECHAZADO, objeto.last_payment_error?.message ?? 'Stripe rechazó el cobro');
    case 'refund.created':
    case 'refund.updated':
    case 'charge.refund.updated':
      if (objeto.status === 'succeeded') return notificar(TipoOperacion.REEMBOLSO, ResultadoCobro.APROBADO, null);
      if (objeto.status === 'failed' || objeto.status === 'canceled') {
        return notificar(TipoOperacion.REEMBOLSO, ResultadoCobro.RECHAZADO, objeto.failure_reason ?? 'Stripe no completó el reembolso');
      }
      return null; // `pending`: llegará otro evento cuando se resuelva
    default:
      return null;
  }
}
