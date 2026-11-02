import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';
import { EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';

export interface ResultadoPago {
  estado: EstadoTransaccionPedido;
  referenciaPasarela: string | null;
  motivo: string | null;
}

/**
 * Cliente del microservicio de Pagos.
 *
 * Sustituye al adaptador HTTP contra la pasarela que este servicio tenía
 * copiado del de Entradas. Mantiene la misma firma, así que `PagosService` no
 * cambia.
 *
 * ## La traducción de los tres resultados
 *
 * Pagos distingue APROBADO / RECHAZADO / INDETERMINADO. Aquí se mapean a los
 * estados del pedido conservando la distinción que importa:
 *
 * - APROBADO → APROBADA
 * - RECHAZADO → RECHAZADA (se sabe que no hubo cargo)
 * - INDETERMINADO → **FALLIDA**, que en este dominio no significa "falló" sino
 *   "no se sabe": quien llama la trata como PAGO_PENDIENTE_RESOLUCION y no
 *   deja volver a cobrar. Confundirla con RECHAZADA diría que no se cobró
 *   cuando quizá sí.
 *
 * RNF-05: solo datos operativos controlados salen de aquí; nunca cuerpos ni
 * errores crudos.
 */
@Injectable()
export class ClientePagos {
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(@Inject(CONFIGURACION) config: ConfiguracionServicio) {
    this.url = config.pagos.url.replace(/\/$/, '');
    this.timeoutMs = config.pagos.timeoutMs;
  }

  async cobrar(
    id: string,
    monto: string,
    moneda: string,
    tokenPago: string,
    tokenSesion: string,
  ): Promise<ResultadoPago> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const sinResolver = (motivo: string): ResultadoPago => ({
      estado: EstadoTransaccionPedido.FALLIDA,
      referenciaPasarela: null,
      motivo,
    });

    try {
      const respuesta = await fetch(`${this.url}/pagos`, {
        method: 'POST',
        signal,
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion}` },
        body: JSON.stringify({
          claveIdempotencia: id,
          solicitante: 'alimentos',
          monto: Number(monto),
          moneda,
          token: tokenPago,
          descripcion: `Pedido ${id}`,
        }),
      });

      // 409: la clave ya se usó para otra operación. Es un error de quien
      // llama, no una duda, y reintentarlo no arreglaría nada.
      if (respuesta.status === 409) {
        return { estado: EstadoTransaccionPedido.RECHAZADA, referenciaPasarela: null, motivo: 'CLAVE_INCOMPATIBLE' };
      }
      if (!respuesta.ok) return sinResolver('PAGOS_ERROR_HTTP');

      const datos = (await respuesta.json()) as Record<string, unknown>;
      const referencia = typeof datos.referencia === 'string' ? datos.referencia : null;

      if (datos.resultado === 'APROBADO' && referencia) {
        return { estado: EstadoTransaccionPedido.APROBADA, referenciaPasarela: referencia, motivo: null };
      }
      if (datos.resultado === 'RECHAZADO') {
        return {
          estado: EstadoTransaccionPedido.RECHAZADA,
          referenciaPasarela: referencia,
          motivo: typeof datos.motivo === 'string' ? datos.motivo : 'PAGO_RECHAZADO',
        };
      }
      return sinResolver(typeof datos.motivo === 'string' ? datos.motivo : 'PAGOS_SIN_RESOLVER');
    } catch {
      return sinResolver(signal.aborted ? 'PAGOS_TIMEOUT' : 'PAGOS_ERROR_TECNICO');
    }
  }
}
