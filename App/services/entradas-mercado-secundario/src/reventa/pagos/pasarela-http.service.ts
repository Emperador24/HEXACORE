import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import { ProcesadorPagos, RespuestaCobro, ResultadoCobro, SolicitudCobro, SolicitudReembolso } from './procesador-pagos';

/** Forma de la respuesta de la pasarela. */
interface CuerpoPasarela {
  referencia?: string;
  estado?: string;
  motivo?: string | null;
}

/**
 * Adaptador HTTP a la Pasarela de Pagos.
 *
 * **Este es el único archivo que hay que reescribir para cambiar de proveedor**
 * (RNF-16). Todo lo que sabe del proveedor concreto —la ruta, la forma del
 * cuerpo, cómo se llama su identificador de cobro— vive aquí dentro; hacia
 * fuera solo expone `ProcesadorPagos`.
 *
 * ## Lo que de verdad hace este componente
 *
 * Traducir los fallos de red al vocabulario del dominio. Un `fetch` puede
 * fallar de muchas formas y no todas significan lo mismo para el CU-006:
 *
 * - La pasarela responde "rechazado" -> **RECHAZADO** (CU-006G). Se sabe que no
 *   hubo cargo.
 * - Timeout, DNS, conexión rechazada, 502 -> **INDETERMINADO** (CU-006I). El
 *   cobro pudo haberse hecho o no, y confundir esto con un rechazo sería lo
 *   peor que puede pasar: daría por seguro que no se cobró cuando quizá sí.
 *
 * Por eso el `catch` no devuelve RECHAZADO. Ante la duda, INDETERMINADO.
 */
@Injectable()
export class PasarelaHttp implements ProcesadorPagos {
  private readonly log = new Logger(PasarelaHttp.name);
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(@Inject(CONFIGURACION) config: ConfiguracionServicio) {
    this.url = config.pasarelaPagos.url;
    this.timeoutMs = config.pasarelaPagos.timeoutMs;
  }

  async cobrar(solicitud: SolicitudCobro): Promise<RespuestaCobro> {
    return this.enviar('/pagos', solicitud.claveIdempotencia, {
      monto: solicitud.monto,
      moneda: solicitud.moneda,
      token: solicitud.token,
      descripcion: solicitud.descripcion,
    });
  }

  /**
   * Reembolso (CU-003). Mismo protocolo y misma traducción de fallos que el
   * cobro: un reembolso sin respuesta tampoco dice si el dinero volvió.
   */
  async reembolsar(solicitud: SolicitudReembolso): Promise<RespuestaCobro> {
    return this.enviar('/reembolsos', solicitud.claveIdempotencia, {
      referenciaCobro: solicitud.referenciaCobro,
      monto: solicitud.monto,
      moneda: solicitud.moneda,
      motivo: solicitud.motivo,
    });
  }

  private async enviar(ruta: string, claveIdempotencia: string, cuerpoPeticion: object): Promise<RespuestaCobro> {
    // El timeout no es opcional: sin él, una pasarela que no responde deja la
    // petición colgada indefinidamente y con ella el bloqueo de Redis, el
    // comprador esperando y una conexión del pool ocupada. Es la mitigación
    // que el SAD §13 pide para el riesgo de la pasarela externa.
    const aborto = AbortSignal.timeout(this.timeoutMs);

    try {
      const respuesta = await fetch(`${this.url}${ruta}`, {
        method: 'POST',
        signal: aborto,
        headers: {
          'Content-Type': 'application/json',
          // Reintentar con la misma clave no cobra (ni reembolsa) dos veces.
          'Idempotency-Key': claveIdempotencia,
        },
        body: JSON.stringify(cuerpoPeticion),
      });

      if (!respuesta.ok) {
        // 4xx y 5xx se tratan distinto a propósito. Un 4xx es una petición mal
        // formada por nuestra parte: la pasarela la entendió y no cobró, así
        // que es un rechazo con causa conocida. Un 5xx no dice nada sobre si
        // llegó a cobrarse.
        const texto = await respuesta.text().catch(() => '');

        // 408 y 429 son 4xx pero no dicen nada sobre si hubo cargo: el primero
        // es un tiempo agotado y el segundo puede llegar con la petición ya en
        // curso al otro lado. Van con los indeterminados, no con los rechazos.
        const sinCerteza = respuesta.status === 408 || respuesta.status === 429;

        if (respuesta.status >= 400 && respuesta.status < 500 && !sinCerteza) {
          this.log.warn(`La pasarela rechazó la petición (${respuesta.status}): ${texto}`);
          return {
            resultado: ResultadoCobro.RECHAZADO,
            referencia: null,
            motivo: `La pasarela rechazó la petición (${respuesta.status})`,
          };
        }
        this.log.error(`La pasarela falló con ${respuesta.status}: ${texto}`);
        return {
          resultado: ResultadoCobro.INDETERMINADO,
          referencia: null,
          motivo: `La pasarela respondió ${respuesta.status}`,
        };
      }

      const cuerpo = (await respuesta.json()) as CuerpoPasarela;

      if (cuerpo.estado === 'APROBADO') {
        if (!cuerpo.referencia) {
          // Un cobro aprobado sin referencia no se puede conciliar después, y
          // la base lo rechazaría por su restricción CHECK. Mejor tratarlo como
          // indeterminado que guardar una aprobación que no se puede rastrear.
          this.log.error('La pasarela aprobó sin devolver referencia');
          return {
            resultado: ResultadoCobro.INDETERMINADO,
            referencia: null,
            motivo: 'La pasarela aprobó el cobro sin devolver referencia',
          };
        }
        return { resultado: ResultadoCobro.APROBADO, referencia: cuerpo.referencia, motivo: null };
      }

      if (cuerpo.estado === 'RECHAZADO') {
        return {
          resultado: ResultadoCobro.RECHAZADO,
          referencia: cuerpo.referencia ?? null,
          motivo: cuerpo.motivo ?? 'La pasarela rechazó el cobro',
        };
      }

      // Cualquier otro estado —`PENDIENTE`, `EN_REVISION`, uno que el proveedor
      // añada mañana, o el campo ausente— es INDETERMINADO, no un rechazo.
      //
      // Tratarlo como rechazo sería afirmar que no hubo cargo sin saberlo, y
      // aguas abajo eso libera el bloqueo y devuelve la entrada al mercado: si
      // el cobro acabara liquidándose, quedaría alguien pagando una entrada que
      // se vendió a otro. Es exactamente el error que esta clase existe para no
      // cometer.
      this.log.error(`La pasarela devolvió un estado que no se reconoce: ${cuerpo.estado ?? '(ausente)'}`);
      return {
        resultado: ResultadoCobro.INDETERMINADO,
        referencia: cuerpo.referencia ?? null,
        motivo: `Estado desconocido de la pasarela: ${cuerpo.estado ?? '(ausente)'}`,
      };
    } catch (error) {
      // Timeout, DNS, conexión rechazada, respuesta ilegible: en ninguno de
      // estos casos sabemos si el cargo se hizo. INDETERMINADO, nunca
      // RECHAZADO.
      const causa = error instanceof Error ? `${error.name}: ${error.message}` : 'error desconocido';
      this.log.error(`No hubo respuesta de la pasarela (${causa})`);
      return {
        resultado: ResultadoCobro.INDETERMINADO,
        referencia: null,
        motivo: `No hubo respuesta de la pasarela (${causa})`,
      };
    }
  }
}
