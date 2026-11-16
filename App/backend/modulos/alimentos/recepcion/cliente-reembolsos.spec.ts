import { randomUUID } from 'node:crypto';
import { ClienteReembolsos } from './cliente-reembolsos.service';
import { PagosService } from '../../finanzas/pagos';
import { CancelacionPedido } from '../persistencia/entidades/cancelacion-pedido.entity';

describe('Adaptador público de reembolso Alimentos', () => {
  const pagos = { reembolsar: jest.fn(), consultar: jest.fn() };
  const api = new ClienteReembolsos(pagos as unknown as PagosService);
  const op = { reembolsoId: randomUUID(), referenciaCobro: `pas_${randomUUID()}`, monto: '1000.25', moneda: 'COP', motivo: 'No se puede preparar' } as CancelacionPedido;
  beforeEach(() => jest.resetAllMocks());
  it('usa exclusivamente clave, referencia, importe y moneda persistidos por el servidor', async () => {
    pagos.reembolsar.mockResolvedValue({ resultado: 'APROBADO', referencia: 'ree_prueba' });
    await api.solicitar(op);
    expect(pagos.reembolsar).toHaveBeenCalledWith(expect.objectContaining({ claveIdempotencia: op.reembolsoId, referenciaCobro: op.referenciaCobro, monto: 1000.25, moneda: 'COP', solicitante: 'alimentos', motivo: op.motivo }));
  });
  it.each([{ tipo: 'COBRO', monto: '1000.25', moneda: 'COP' }, { tipo: 'REEMBOLSO', monto: '1.00', moneda: 'COP' }, { tipo: 'REEMBOLSO', monto: '1000.25', moneda: 'USD' }])('rechaza evidencia de otra operación: %j', async r => {
    pagos.consultar.mockResolvedValue(r); await expect(api.consultar(op)).rejects.toThrow('EVIDENCIA_REEMBOLSO_INCOMPATIBLE');
    expect(pagos.reembolsar).not.toHaveBeenCalled();
  });
});
