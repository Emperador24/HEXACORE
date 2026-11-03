import { EstadoQr } from '../persistencia/entidades/qr-entrada.entity';
import { cambiosDe } from './proyeccion-qr.service';

const HASH = 'a'.repeat(64);
const entrada = {
  entradaId: '20000001-0000-4000-8000-000000000001',
  numeroTicket: 'TCK-2026-001000',
  localidadNombre: 'General',
  hashQr: HASH,
};

describe('Qué cambia en la puerta con cada evento de Ventas (ADR-15)', () => {
  it('CompraConfirmada activa un QR VALIDA por entrada, en el evento de la compra', () => {
    const cambios = cambiosDe({
      tipo: 'COMPRA_CONFIRMADA',
      version: 1,
      secuencia: 7,
      eventoId: 'e0000001-0000-4000-8000-000000000001',
      entradas: [entrada, { ...entrada, entradaId: 'otra', hashQr: 'b'.repeat(64) }],
    });
    expect(cambios).toHaveLength(2);
    expect(cambios?.[0]).toMatchObject({ estado: EstadoQr.VALIDA, secuencia: 7, hashQr: HASH });
    expect(cambios?.[0].eventoId).toBe('e0000001-0000-4000-8000-000000000001');
  });

  it('EntradaActualizada trae el estado nuevo y el hash del QR vigente', () => {
    const cambios = cambiosDe({
      tipo: 'ENTRADA_ACTUALIZADA',
      version: 1,
      secuencia: 9,
      eventoId: 'e0000001-0000-4000-8000-000000000001',
      estado: 'EN_REVENTA',
      ...entrada,
    });
    expect(cambios).toEqual([expect.objectContaining({ estado: EstadoQr.EN_REVENTA, secuencia: 9 })]);
  });

  it('lo que no entiende va a la DLQ: sin secuencia, otra versión, un hash que no es SHA-256', () => {
    const base = { tipo: 'ENTRADA_ACTUALIZADA', version: 1, secuencia: 1, eventoId: 'e', estado: 'VALIDA', ...entrada };
    expect(cambiosDe({ ...base, secuencia: undefined })).toBeNull();
    expect(cambiosDe({ ...base, version: 2 })).toBeNull();
    expect(cambiosDe({ ...base, hashQr: 'HXC-QR-000001' })).toBeNull();
    expect(cambiosDe({ ...base, estado: 'PERDIDA' })).toBeNull();
  });

  it('un hecho de Ventas que no es de la puerta se ignora sin error', () => {
    expect(cambiosDe({ tipo: 'COMPRA_CANCELADA', version: 1, secuencia: 3 })).toEqual([]);
  });
});
