import { HttpException, Injectable } from '@nestjs/common';
import { CobrarDto, PagosService, validarSolicitudPagos } from '../../finanzas/pagos';
import { EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';

export interface ResultadoPago {
  estado: EstadoTransaccionPedido;
  referenciaPasarela: string | null;
  motivo: string | null;
}

/** Adaptador local. La ruta de pedidos conserva su guarda y alcance por cliente. */
@Injectable()
export class ClientePagos {
  constructor(private readonly pagos: PagosService) {}

  async cobrar(id: string, monto: string, moneda: string, tokenPago: string, _tokenSesion: string): Promise<ResultadoPago> {
    const sinResolver = (motivo: string): ResultadoPago => ({
      estado: EstadoTransaccionPedido.FALLIDA, referenciaPasarela: null, motivo,
    });
    try {
      const dto = await validarSolicitudPagos(CobrarDto, {
        claveIdempotencia: id, solicitante: 'alimentos', monto: Number(monto),
        moneda, token: tokenPago, descripcion: `Pedido ${id}`,
      });
      const datos = await this.pagos.cobrar(dto);
      const referencia = typeof datos.referencia === 'string' ? datos.referencia : null;
      if (datos.resultado === 'APROBADO' && referencia) {
        return { estado: EstadoTransaccionPedido.APROBADA, referenciaPasarela: referencia, motivo: null };
      }
      if (datos.resultado === 'RECHAZADO') {
        return { estado: EstadoTransaccionPedido.RECHAZADA, referenciaPasarela: referencia,
          motivo: typeof datos.motivo === 'string' ? datos.motivo : 'PAGO_RECHAZADO' };
      }
      return sinResolver(typeof datos.motivo === 'string' ? datos.motivo : 'PAGOS_SIN_RESOLVER');
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409) {
        return { estado: EstadoTransaccionPedido.RECHAZADA, referenciaPasarela: null, motivo: 'CLAVE_INCOMPATIBLE' };
      }
      // Conserva el código previo para los fallos que la API HTTP habría dado como 4xx/5xx.
      // Un fallo de validación/persistencia no acredita que la pasarela haya rechazado.
      return sinResolver('PAGOS_ERROR_HTTP');
    }
  }
}
