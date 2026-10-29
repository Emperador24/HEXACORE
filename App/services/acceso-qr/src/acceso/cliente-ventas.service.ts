import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

/** Lo que Ventas puede responder al pedirle gastar un QR. */
export enum RespuestaVentas {
  OK = 'OK',
  QR_DESCONOCIDO = 'QR_DESCONOCIDO',
  OTRO_EVENTO = 'OTRO_EVENTO',
  YA_UTILIZADA = 'YA_UTILIZADA',
  ANULADA = 'ANULADA',
  EN_REVENTA = 'EN_REVENTA',
  /** No hubo respuesta. **No se sabe si quedó marcada.** */
  SIN_RESPUESTA = 'SIN_RESPUESTA',
}

export interface EntradaGastada {
  respuesta: RespuestaVentas;
  entradaId: string | null;
  numeroTicket: string | null;
  localidadNombre: string | null;
}

/**
 * Cliente de la API interna de Ventas.
 *
 * `Entrada` es de Ventas desde ADR-14: la puerta pide que gasten un QR, no lo
 * gasta ella. La condición `estado = VALIDA` que impide la doble entrada sigue
 * resolviéndola PostgreSQL, solo que en la otra base.
 *
 * ## SIN_RESPUESTA no es un rechazo
 *
 * Un timeout contra Ventas no dice si la entrada quedó marcada o no. Tratarlo
 * como "no vale" dejaría pasar a alguien con la entrada ya gastada; tratarlo
 * como "vale" dejaría pasar a quien no debía. Se devuelve el tercer valor y
 * quien llama decide — y lo que decide es **no dejar pasar y compensar**,
 * porque en una puerta el error caro es el falso positivo.
 */
@Injectable()
export class ClienteVentas {
  private readonly log = new Logger(ClienteVentas.name);
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(@Inject(CONFIGURACION) config: ConfiguracionServicio) {
    this.url = config.ventas.url.replace(/\/$/, '');
    this.timeoutMs = config.ventas.timeoutMs;
  }

  async marcarUsada(codigoQr: string, eventoId: string, tokenSesion: string): Promise<EntradaGastada> {
    const vacia = (respuesta: RespuestaVentas): EntradaGastada => ({
      respuesta,
      entradaId: null,
      numeroTicket: null,
      localidadNombre: null,
    });
    const signal = AbortSignal.timeout(this.timeoutMs);

    try {
      const respuesta = await fetch(`${this.url}/interno/entradas/marcar-usada`, {
        method: 'POST',
        signal,
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion}` },
        body: JSON.stringify({ codigoQr, eventoId }),
      });

      if (respuesta.status === 404 || respuesta.status === 409) {
        const cuerpo = (await respuesta.json()) as { codigo?: string; entradaId?: string };
        const codigo = cuerpo?.codigo;
        // El id viene incluso al rechazar: hace falta para mirar en la tabla
        // de ingresos cuándo y por dónde se usó (CU-002D).
        const conId = (r: RespuestaVentas): EntradaGastada => ({
          ...vacia(r),
          entradaId: typeof cuerpo?.entradaId === 'string' ? cuerpo.entradaId : null,
        });
        if (codigo && codigo in RespuestaVentas) return conId(codigo as RespuestaVentas);
        return vacia(RespuestaVentas.QR_DESCONOCIDO);
      }
      if (!respuesta.ok) return vacia(RespuestaVentas.SIN_RESPUESTA);

      const datos = (await respuesta.json()) as Record<string, unknown>;
      if (typeof datos.entradaId !== 'string') return vacia(RespuestaVentas.SIN_RESPUESTA);

      return {
        respuesta: RespuestaVentas.OK,
        entradaId: datos.entradaId,
        numeroTicket: typeof datos.numeroTicket === 'string' ? datos.numeroTicket : null,
        localidadNombre: typeof datos.localidadNombre === 'string' ? datos.localidadNombre : null,
      };
    } catch {
      return vacia(RespuestaVentas.SIN_RESPUESTA);
    }
  }

  /**
   * Compensación: pide a Ventas devolver la entrada a `VALIDA`.
   *
   * Se usa cuando la entrada quedó marcada pero el ingreso no se pudo
   * registrar aquí. Sin esto, esa persona se queda con la entrada gastada sin
   * haber entrado — el peor resultado posible en una puerta.
   *
   * Si la compensación también falla, se registra bien fuerte: es una fila que
   * hay que arreglar a mano, y es mejor saberlo que descubrirlo por la queja.
   */
  async revertirUso(entradaId: string, tokenSesion: string): Promise<boolean> {
    try {
      const respuesta = await fetch(`${this.url}/interno/entradas/revertir-uso`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion}` },
        body: JSON.stringify({ entradaId }),
      });
      if (respuesta.ok) return true;
    } catch {
      /* cae abajo */
    }
    this.log.error(
      `COMPENSACIÓN FALLIDA: la entrada ${entradaId} quedó USADA sin ingreso registrado. ` +
        'Hay que devolverla a VALIDA a mano.',
    );
    return false;
  }

  /**
   * Hashes de los QR válidos del evento (CU-002E).
   *
   * Se piden a Ventas porque las entradas son suyas. Vienen hasheados: el
   * dispositivo de la puerta solo necesita comparar, no conocer los códigos.
   */
  async qrValidos(eventoId: string, tokenSesion: string): Promise<{ hash: string; numeroTicket: string; localidadNombre: string }[]> {
    const respuesta = await fetch(`${this.url}/interno/entradas/eventos/${eventoId}/qr-validos`, {
      signal: AbortSignal.timeout(this.timeoutMs * 4),
      redirect: 'error',
      headers: { Authorization: `Bearer ${tokenSesion}` },
    });
    if (!respuesta.ok) {
      throw new Error(`Ventas no entregó los QR válidos de ${eventoId}`);
    }
    return (await respuesta.json()) as { hash: string; numeroTicket: string; localidadNombre: string }[];
  }
}
