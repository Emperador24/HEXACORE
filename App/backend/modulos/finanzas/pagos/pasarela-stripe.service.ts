import { Logger } from '@nestjs/common';
import type { ConfiguracionServicio } from './config/configuracion';
import { ProcesadorPagos, RespuestaCobro, ResultadoCobro, SolicitudCobro, SolicitudReembolso } from './procesador-pagos';

/**
 * Tokens de la pasarela simulada que siguen mandando la app móvil, los pedidos
 * y las demos. En modo de prueba se traducen a los métodos de pago de prueba
 * de Stripe, así esos flujos cobran de verdad en el sandbox sin cambiar nada.
 *
 * `tok_timeout…` y `tok_error…` no tienen equivalente en Stripe: provocan una
 * respuesta INDETERMINADO sin llamar a nadie, para poder seguir mostrando
 * CU-006I. `tok_noreemb…` se cobra normal; Stripe en prueba no deja forzar un
 * reembolso rechazado (CU-003C), eso solo se ve con la pasarela simulada.
 */
const TOKENS_DEMO: { prefijo: string; metodo: string | null }[] = [
  { prefijo: 'tok_ok', metodo: 'pm_card_visa' },
  { prefijo: 'tok_noreemb', metodo: 'pm_card_visa' },
  { prefijo: 'tok_rechazo', metodo: 'pm_card_chargeDeclined' },
  { prefijo: 'tok_timeout', metodo: null },
  { prefijo: 'tok_error', metodo: null },
];

/** Lo que importa de un PaymentIntent o un Refund de Stripe. */
interface ObjetoStripe {
  id?: string;
  status?: string;
  last_payment_error?: { message?: string; decline_code?: string; code?: string } | null;
  failure_reason?: string | null;
}

interface ErrorStripe {
  error?: { type?: string; code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string } };
}

/**
 * Adaptador a Stripe (PaymentIntents y Refunds).
 *
 * Igual que `PasarelaHttp`, todo lo que sabe del proveedor vive aquí (RNF-16):
 * hacia fuera solo expone `ProcesadorPagos`, y Pagos, Entradas, Pedidos y
 * Parqueaderos no se enteran de cuál está detrás.
 *
 * - El navegador convierte la tarjeta en un `pm_…` con Stripe Elements y la
 *   llave pública: los datos de la tarjeta nunca llegan aquí (RNF-05).
 * - Se cobra con `confirm=true`, así la respuesta ya dice si se aprobó.
 * - La `claveIdempotencia` va como `Idempotency-Key`, que Stripe respeta igual
 *   que la pasarela simulada: reintentar no cobra dos veces (CU-006I). Va
 *   también en `metadata`, que es como el webhook encuentra la operación.
 * - Las cantidades viajan en la unidad mínima de la moneda: pesos × 100.
 *
 * Traducción de fallos, con el mismo criterio que `PasarelaHttp`: lo que
 * Stripe contesta con certeza (aprobado, tarjeta rechazada, petición inválida)
 * es final; timeout, 429, 5xx o un estado intermedio son INDETERMINADO.
 */
export class PasarelaStripe implements ProcesadorPagos {
  private readonly log = new Logger(PasarelaStripe.name);
  private readonly url: string;
  private readonly claveSecreta: string;
  private readonly timeoutMs: number;
  private readonly modoPrueba: boolean;

  constructor(config: ConfiguracionServicio) {
    this.url = config.pasarelaPagos.stripe.url;
    this.claveSecreta = config.pasarelaPagos.stripe.claveSecreta;
    this.timeoutMs = config.pasarelaPagos.timeoutMs;
    this.modoPrueba = this.claveSecreta.startsWith('sk_test_');
  }

  async cobrar(solicitud: SolicitudCobro): Promise<RespuestaCobro> {
    const metodo = this.metodoDePago(solicitud.token);
    if (metodo === undefined) {
      return { resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'El medio de pago no es válido para Stripe' };
    }
    if (metodo === null) {
      return { resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'Fallo de pasarela simulado (token de demostración)' };
    }

    return this.enviar('/payment_intents', solicitud.claveIdempotencia, {
      amount: centavos(solicitud.monto),
      currency: solicitud.moneda.toLowerCase(),
      payment_method: metodo,
      confirm: 'true',
      description: solicitud.descripcion.slice(0, 1000),
      // Sin redirecciones: el cobro se resuelve en esta misma llamada. Una
      // tarjeta que pida 3-D Secure vuelve como `requires_action` y se trata
      // como rechazo (no hubo cargo).
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      'metadata[claveIdempotencia]': solicitud.claveIdempotencia,
      'metadata[operacion]': 'COBRO',
    });
  }

  async reembolsar(solicitud: SolicitudReembolso): Promise<RespuestaCobro> {
    return this.enviar('/refunds', solicitud.claveIdempotencia, {
      payment_intent: solicitud.referenciaCobro,
      amount: centavos(solicitud.monto),
      reason: 'requested_by_customer',
      'metadata[claveIdempotencia]': solicitud.claveIdempotencia,
      'metadata[operacion]': 'REEMBOLSO',
      'metadata[motivo]': (solicitud.motivo ?? '').slice(0, 500),
    });
  }

  /**
   * `pm_…` viene de Stripe Elements y se usa tal cual. Los tokens de la
   * pasarela simulada solo se aceptan en modo de prueba: con llaves reales un
   * `tok_ok` cobraría a una tarjeta de prueba, que Stripe rechaza.
   * Devuelve `undefined` si no sirve y `null` si es un fallo simulado.
   */
  private metodoDePago(token: string): string | null | undefined {
    if (token.startsWith('pm_')) return token;
    if (!this.modoPrueba) return undefined;
    const demo = TOKENS_DEMO.find((t) => token.startsWith(t.prefijo));
    return demo ? demo.metodo : undefined;
  }

  private async enviar(ruta: string, claveIdempotencia: string, campos: Record<string, string | number>): Promise<RespuestaCobro> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.url}${ruta}`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Authorization: `Bearer ${this.claveSecreta}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': claveIdempotencia,
        },
        body: new URLSearchParams(Object.entries(campos).map(([k, v]): [string, string] => [k, String(v)])).toString(),
      });
    } catch (error) {
      const causa = error instanceof Error ? `${error.name}: ${error.message}` : 'error desconocido';
      this.log.error(`No hubo respuesta de Stripe (${causa})`);
      return { resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: `No hubo respuesta de Stripe (${causa})` };
    }

    const cuerpo = (await respuesta.json().catch(() => ({}))) as ObjetoStripe & ErrorStripe;

    if (!respuesta.ok) {
      const e = cuerpo.error ?? {};
      // 402 es la tarjeta rechazada; 400 una petición que Stripe entendió y no
      // ejecutó. Los dos son "seguro que no hubo cargo". 429 y 5xx no lo son.
      if (respuesta.status === 402 || (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429)) {
        if (respuesta.status === 401) this.log.error('Stripe rechazó la llave secreta (STRIPE_CLAVE_SECRETA)');
        else this.log.warn(`Stripe rechazó la operación (${respuesta.status} ${e.code ?? e.type ?? ''}): ${e.message ?? ''}`);
        return {
          resultado: ResultadoCobro.RECHAZADO,
          referencia: e.payment_intent?.id ?? null,
          motivo: motivoDe(e.decline_code ?? e.code, e.message),
        };
      }
      this.log.error(`Stripe falló con ${respuesta.status}: ${e.message ?? ''}`);
      return { resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: `Stripe respondió ${respuesta.status}` };
    }

    switch (cuerpo.status) {
      case 'succeeded':
        if (!cuerpo.id) {
          return { resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'Stripe aprobó sin devolver referencia' };
        }
        return { resultado: ResultadoCobro.APROBADO, referencia: cuerpo.id, motivo: null };
      case 'requires_payment_method':
      case 'canceled':
      case 'failed':
        return {
          resultado: ResultadoCobro.RECHAZADO,
          referencia: cuerpo.id ?? null,
          motivo: motivoDe(cuerpo.last_payment_error?.decline_code ?? cuerpo.failure_reason ?? undefined, cuerpo.last_payment_error?.message),
        };
      case 'requires_action':
        // No hubo cargo: queda esperando una autenticación que este flujo no ofrece.
        return { resultado: ResultadoCobro.RECHAZADO, referencia: cuerpo.id ?? null, motivo: 'La tarjeta pide autenticación 3-D Secure, que este portal no admite' };
      default:
        // `processing`, `pending`… Stripe aún no sabe: lo resuelve el webhook.
        this.log.warn(`Stripe dejó ${cuerpo.id ?? '(sin id)'} en "${cuerpo.status ?? '(sin estado)'}"; se resolverá por webhook`);
        return { resultado: ResultadoCobro.INDETERMINADO, referencia: cuerpo.id ?? null, motivo: `Stripe dejó la operación en "${cuerpo.status ?? '(sin estado)'}"` };
    }
  }
}

/** Pesos a centavos, sin errores de coma flotante. */
function centavos(monto: number): number {
  return Math.round(monto * 100);
}

/** Motivo corto y en español para el comprador; cabe en los 120 caracteres del libro. */
function motivoDe(codigo: string | undefined, mensaje: string | undefined): string {
  const conocidos: Record<string, string> = {
    card_declined: 'El banco rechazó la tarjeta',
    generic_decline: 'El banco rechazó la tarjeta',
    insufficient_funds: 'Fondos insuficientes',
    lost_card: 'La tarjeta está reportada como perdida',
    stolen_card: 'La tarjeta está reportada como robada',
    expired_card: 'La tarjeta está vencida',
    incorrect_cvc: 'El código de seguridad no es correcto',
    processing_error: 'El banco no pudo procesar la tarjeta',
    charge_already_refunded: 'El cobro ya estaba reembolsado',
  };
  return (codigo && conocidos[codigo]) || (mensaje ?? 'Stripe rechazó la operación').slice(0, 120);
}
