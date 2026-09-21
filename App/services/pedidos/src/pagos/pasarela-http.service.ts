import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';

export interface ResultadoPago {
  estado: EstadoTransaccionPedido;
  referenciaPasarela: string | null;
  motivo: string | null;
}

/** RNF-05: solo datos operativos controlados salen del adaptador; nunca cuerpos ni errores crudos. */
@Injectable()
export class PasarelaHttp {
  constructor(@Inject(CONFIGURACION) private readonly config: ConfiguracionServicio) {}

  async cobrar(id: string, monto: string, moneda: string, tokenPago: string): Promise<ResultadoPago> {
    const signal = AbortSignal.timeout(this.config.pasarelaPagos.timeoutMs);
    const fallida = (motivo: string): ResultadoPago => ({
      estado: EstadoTransaccionPedido.FALLIDA, referenciaPasarela: null, motivo,
    });
    try {
      const respuesta = await fetch(`${this.config.pasarelaPagos.url.replace(/\/$/, '')}/pagos`, {
        method: 'POST', signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
        body: JSON.stringify({ monto: Number(monto), moneda, token: tokenPago }),
      });
      if (!respuesta.ok) return fallida('PASARELA_ERROR_HTTP');
      const cuerpo: unknown = await respuesta.json();
      if (!cuerpo || typeof cuerpo !== 'object') return fallida('PASARELA_RESPUESTA_INVALIDA');
      const datos = cuerpo as Record<string, unknown>;
      // La referencia del simulador siempre es pas_<UUID>. No persistir texto arbitrario del proveedor.
      if (typeof datos.referencia !== 'string' ||
          !/^pas_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datos.referencia) ||
          datos.monto !== Number(monto) || datos.moneda !== moneda) {
        return fallida('PASARELA_RESPUESTA_INVALIDA');
      }
      if (datos.estado === 'APROBADO') return {
        estado: EstadoTransaccionPedido.APROBADA, referenciaPasarela: datos.referencia, motivo: null,
      };
      if (datos.estado === 'RECHAZADO') return {
        estado: EstadoTransaccionPedido.RECHAZADA, referenciaPasarela: datos.referencia, motivo: 'PAGO_RECHAZADO',
      };
      return fallida('PASARELA_RESPUESTA_INVALIDA');
    } catch {
      return fallida(signal.aborted ? 'PASARELA_TIMEOUT' : 'PASARELA_ERROR_TECNICO');
    }
  }
}
