import { DataSource } from 'typeorm';
import { PagosService } from './pagos.service';
import { ProcesadorPagos } from './procesador-pagos';

describe('Consulta pública local del libro financiero', () => {
  const repo = { findOne: jest.fn() };
  const proveedor = { cobrar: jest.fn(), reembolsar: jest.fn() };
  const api = new PagosService({ getRepository: () => repo } as unknown as DataSource, proveedor as unknown as ProcesadorPagos);
  beforeEach(() => jest.resetAllMocks());
  it('limita la clave a su solicitante y no reenvía ni modifica el libro', async () => {
    repo.findOne.mockResolvedValue({ tipo: 'REEMBOLSO', monto: '1000.25', moneda: 'COP', resultado: 'APROBADO', referencia: 'ree_confirmada', motivo: null, solicitante: 'alimentos', intentos: 1 });
    expect(await api.consultar('clave', 'alimentos')).toEqual({ tipo: 'REEMBOLSO', monto: '1000.25', moneda: 'COP', resultado: 'APROBADO', referencia: 'ree_confirmada', motivo: null });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { claveIdempotencia: 'clave', solicitante: 'alimentos' } });
    expect(proveedor.reembolsar).not.toHaveBeenCalled(); expect(proveedor.cobrar).not.toHaveBeenCalled();
  });
  it('la ausencia de registro es ausencia de evidencia, nunca un rechazo inventado', async () => {
    repo.findOne.mockResolvedValue(null); expect(await api.consultar('clave', 'alimentos')).toBeNull();
  });
});
