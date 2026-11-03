import { ConflictException } from '@nestjs/common';
import { PagosService } from '../../../modulos/finanzas/pagos';
import { ClientePagos as Alimentos } from '../../../modulos/alimentos/pagos/cliente-pagos.service';
import { ClientePagos as Entradas } from '../../../modulos/entradas/compartido/cliente-pagos.service';
import { ResultadoCobro } from '../../../modulos/entradas/compartido/procesador-pagos';

const clave = 'a0000000-0000-4000-8000-000000000001';
const referencia = 'pas_b0000000-0000-4000-8000-000000000001';
describe.each(['alimentos', 'entradas'] as const)('Adaptador local de %s', dominio => {
  let cobrar: jest.Mock, reembolsar: jest.Mock, api: Alimentos | Entradas;
  let red: jest.SpyInstance;
  beforeEach(() => {
    cobrar = jest.fn(); reembolsar = jest.fn();
    const libro = { cobrar, reembolsar } as unknown as PagosService;
    api = dominio === 'alimentos' ? new Alimentos(libro) : new Entradas(libro);
    red = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('No debe existir transporte al servidor retirado'));
  });
  afterEach(() => { expect(red).not.toHaveBeenCalled(); red.mockRestore(); });
  async function llamar(monto = 1150.25) {
    return dominio === 'alimentos'
      ? (api as Alimentos).cobrar(clave, String(monto), 'COP', 'tok_ok', 'sesion-del-llamante')
      : (api as Entradas).cobrar({ claveIdempotencia: clave, monto, moneda: 'COP', token: 'tok_ok', descripcion: 'Compra fixture' }, 'sesion-del-llamante');
  }
  const estado = (r: any) => dominio === 'alimentos' ? r.estado : r.resultado;
  const incierto = () => dominio === 'alimentos' ? 'FALLIDA' : 'INDETERMINADO';
  it('conserva clave, solicitante, importe, moneda y referencia sin salir por HTTP', async () => {
    cobrar.mockResolvedValue({ resultado: 'APROBADO', referencia, motivo: null });
    const r: any = await llamar();
    expect(estado(r)).toBe(dominio === 'alimentos' ? 'APROBADA' : 'APROBADO');
    expect(r.referenciaPasarela ?? r.referencia).toBe(referencia);
    expect(cobrar).toHaveBeenCalledWith({ claveIdempotencia: clave, solicitante: dominio, monto: 1150.25,
      moneda: 'COP', token: 'tok_ok', descripcion: dominio === 'alimentos' ? `Pedido ${clave}` : 'Compra fixture' });
  });
  it.each(['RECHAZADO', 'INDETERMINADO'])('conserva el resultado %s sin confundir duda y rechazo', async resultado => {
    cobrar.mockResolvedValue({ resultado, referencia: null, motivo: 'PASARELA_TIMEOUT' });
    const r: any = await llamar();
    expect(estado(r)).toBe(resultado === 'INDETERMINADO' ? incierto() : dominio === 'alimentos' ? 'RECHAZADA' : 'RECHAZADO');
    expect(r.motivo).toBe('PASARELA_TIMEOUT');
  });
  it('mantiene validación financiera antes de operar y no inventa rechazo por un DTO inválido', async () => {
    const r: any = await llamar(1.001);
    expect(estado(r)).toBe(incierto()); expect(r.motivo).toBe('PAGOS_ERROR_HTTP'); expect(cobrar).not.toHaveBeenCalled();
  });
  it('conserva el conflicto de clave como el único error traducido a rechazo', async () => {
    cobrar.mockRejectedValue(new ConflictException({ codigo: 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE' }));
    const r: any = await llamar();
    expect(estado(r)).toBe(dominio === 'alimentos' ? 'RECHAZADA' : 'RECHAZADO');
    expect(r.motivo).toBe(dominio === 'alimentos' ? 'CLAVE_INCOMPATIBLE' : 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE');
  });
  it('conserva como incierto un fallo de persistencia o de ejecución', async () => {
    cobrar.mockRejectedValue(new Error('base no disponible'));
    const r: any = await llamar();
    expect(estado(r)).toBe(incierto()); expect(r.motivo).toBe('PAGOS_ERROR_HTTP');
  });
});
it('reembolso local de Entradas conserva referencia, importe y clave originales', async () => {
  const reembolsar = jest.fn().mockResolvedValue({ resultado: 'APROBADO', referencia, motivo: null });
  const adaptador = new Entradas({ reembolsar } as unknown as PagosService);
  const dto = { claveIdempotencia: clave, referenciaCobro: referencia, monto: 150.25, moneda: 'COP', motivo: 'Cancelación fixture' };
  await expect(adaptador.reembolsar(dto, 'sesion')).resolves.toEqual({ resultado: ResultadoCobro.APROBADO, referencia, motivo: null });
  expect(reembolsar).toHaveBeenCalledWith({ ...dto, solicitante: 'entradas' });
});
