import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import {
  ProcesadorPagos,
  RespuestaCobro,
  ResultadoCobro,
  SolicitudCobro,
  SolicitudReembolso,
} from './procesador-pagos';

/**
 * Cliente del microservicio de Pagos.
 *
 * Sustituye al adaptador HTTP que este servicio tenía contra la pasarela. Esa
 * copia y la de Alimentos habían empezado a divergir —una sabía reembolsar y
 * la otra no—, que es la evidencia del criterio 2 de ADR-14.
 *
 * Cambia a quién se llama, **no el contrato**: sigue implementando
 * `ProcesadorPagos` y devolviendo los mismos tres resultados, así que el
 * `CheckoutService` no se entera. Eso es el "1 componente a modificar" de
 * RNF-16, ahora demostrado de verdad.
 *
 * ## Qué pasa cuando Pagos no responde
 *
 * Lo mismo que cuando no respondía la pasarela: **INDETERMINADO**. Un timeout
 * contra Pagos no dice si hubo cargo —Pagos pudo haber cobrado y perderse la
 * respuesta—, y tratarlo como rechazo sería dar por seguro que no se cobró.
 * El reintento con la misma clave lo resuelve: Pagos devuelve el resultado del
 * primer intento sin volver a cobrar.
 */
@Injectable()
export class ClientePagos implements ProcesadorPagos {
  private readonly log = new Logger(ClientePagos.name);
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(@Inject(CONFIGURACION) config: ConfiguracionServicio) {
    this.url = config.pagos.url.replace(/\/$/, '');
    this.timeoutMs = config.pagos.timeoutMs;
  }

  async cobrar(solicitud: SolicitudCobro, tokenSesion: string): Promise<RespuestaCobro> {
    return this.enviar('/pagos', tokenSesion, {
      claveIdempotencia: solicitud.claveIdempotencia,
      solicitante: 'entradas',
      monto: solicitud.monto,
      moneda: solicitud.moneda,
      token: solicitud.token,
      descripcion: solicitud.descripcion,
    });
  }

  async reembolsar(solicitud: SolicitudReembolso, tokenSesion: string): Promise<RespuestaCobro> {
    return this.enviar('/pagos/reembolsos', tokenSesion, {
      claveIdempotencia: solicitud.claveIdempotencia,
      solicitante: 'entradas',
      referenciaCobro: solicitud.referenciaCobro,
      monto: solicitud.monto,
      moneda: solicitud.moneda,
      motivo: solicitud.motivo,
    });
  }

  private async enviar(ruta: string, tokenSesion: string, cuerpo: object): Promise<RespuestaCobro> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const indeterminado = (motivo: string): RespuestaCobro => ({
      resultado: ResultadoCobro.INDETERMINADO,
      referencia: null,
      motivo,
    });

    try {
      const respuesta = await fetch(`${this.url}${ruta}`, {
        method: 'POST',
        signal,
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion}` },
        body: JSON.stringify(cuerpo),
      });

      // 409 es la única respuesta de error que significa algo concreto: la
      // clave ya se usó para otra operación. No es "no se sabe", es "quien
      // llama se equivocó", y se propaga como rechazo para no reintentar.
      if (respuesta.status === 409) {
        return { resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE' };
      }
      if (!respuesta.ok) return indeterminado('PAGOS_ERROR_HTTP');

      const datos = (await respuesta.json()) as Record<string, unknown>;
      const resultado = datos.resultado;
      if (
        resultado !== ResultadoCobro.APROBADO &&
        resultado !== ResultadoCobro.RECHAZADO &&
        resultado !== ResultadoCobro.INDETERMINADO
      ) {
        return indeterminado('PAGOS_RESPUESTA_INVALIDA');
      }

      return {
        resultado,
        referencia: typeof datos.referencia === 'string' ? datos.referencia : null,
        motivo: typeof datos.motivo === 'string' ? datos.motivo : null,
      };
    } catch {
      // Ante la duda, INDETERMINADO. Nunca RECHAZADO.
      return indeterminado(signal.aborted ? 'PAGOS_TIMEOUT' : 'PAGOS_ERROR_TECNICO');
    }
  }
}
