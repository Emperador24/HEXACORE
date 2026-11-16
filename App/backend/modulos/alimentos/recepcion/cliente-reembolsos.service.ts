import { Injectable } from '@nestjs/common';
import { PagosService, ReembolsarDto, validarSolicitudPagos } from '../../finanzas/pagos';
import { CancelacionPedido } from '../persistencia/entidades/cancelacion-pedido.entity';

/** Solo API pública local. Nunca consulta tablas de Finanzas desde Alimentos. */
@Injectable()
export class ClienteReembolsos {
  constructor(private readonly pagos: PagosService) {}
  async solicitar(c: CancelacionPedido) {
    const dto = await validarSolicitudPagos(ReembolsarDto, { claveIdempotencia: c.reembolsoId,
      solicitante: 'alimentos', referenciaCobro: c.referenciaCobro,
      monto: Number(c.monto), moneda: c.moneda, motivo: c.motivo });
    return this.pagos.reembolsar(dto);
  }
  async consultar(c: CancelacionPedido) {
    const r = await this.pagos.consultar(c.reembolsoId, 'alimentos');
    if (!r) return null;
    if (r.tipo !== 'REEMBOLSO' || r.monto !== c.monto || r.moneda !== c.moneda) throw new Error('EVIDENCIA_REEMBOLSO_INCOMPATIBLE');
    return r;
  }
}
