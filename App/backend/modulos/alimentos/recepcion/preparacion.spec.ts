import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { OperacionPreparacionDto } from './operacion-preparacion.dto';
import { PreparacionService } from './preparacion.service';
import { EstadoPedido, Pedido } from '../persistencia/entidades/pedido.entity';
import { EstadoTransaccionPedido, TransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { HistorialPreparacion, PreparacionPedido } from '../persistencia/entidades/preparacion-pedido.entity';
import { pagoAcreditado } from './recepcion.service';

describe('Preparación separada del pago', () => {
  const pedido = { id: 'p', estado: EstadoPedido.CONFIRMADO, total: '1000.25', moneda: 'COP' } as Pedido;
  const aprobado = { pedidoId: 'p', estado: EstadoTransaccionPedido.APROBADA, monto: '1000.25', moneda: 'COP' } as TransaccionPedido;
  const historial = new Map<string, Record<string, unknown>>();
  let avance: PreparacionPedido | null;
  const m = { findOne: jest.fn(), findOneBy: jest.fn(), find: jest.fn(), query: jest.fn(), create: jest.fn(), count: jest.fn(), save: jest.fn(), insert: jest.fn() };
  const servicio = new PreparacionService({ transaction: (f: (m: unknown) => unknown) => f(m) } as unknown as DataSource);
  beforeEach(() => {
    jest.resetAllMocks(); historial.clear(); avance = null;
    m.findOne.mockResolvedValue({ ...pedido });
    m.findOneBy.mockImplementation((clase, filtro) => clase === HistorialPreparacion ? historial.get(filtro.id) ?? null : avance);
    m.find.mockResolvedValue([aprobado]); m.query.mockResolvedValue([{ ahora: new Date('2026-11-07T12:00:00Z') }]);
    m.create.mockImplementation((_clase, datos) => datos); m.count.mockResolvedValue(0);
    m.save.mockImplementation((clase, datos) => { if (clase === PreparacionPedido) avance = datos; return datos; });
    m.insert.mockImplementation((_clase, datos) => { historial.set(datos.id, datos); });
  });
  it('exige una única aprobación persistida con importe y moneda acordados', () => {
    expect(pagoAcreditado(pedido, [aprobado])).toBe(true);
    expect(pagoAcreditado(pedido, [])).toBe(false);
    expect(pagoAcreditado(pedido, [aprobado, aprobado])).toBe(false);
    expect(pagoAcreditado(pedido, [{ ...aprobado, monto: '0.01' }])).toBe(false);
    expect(pagoAcreditado(pedido, [{ ...aprobado, estado: EstadoTransaccionPedido.RECHAZADA }])).toBe(false);
  });
  it.each([EstadoPedido.CANCELADO, EstadoPedido.EXPIRADO, EstadoPedido.PENDIENTE_PAGO])('no prepara %s aunque exista una aprobación', async estado => {
    m.findOne.mockResolvedValue({ ...pedido, estado });
    await expect(servicio.operar('l', 'p', 'actor', 'op', { accion: 'INICIAR', version: 0, minutos: 10 })).rejects.toMatchObject({ status: 409 });
    expect(m.save).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled();
  });
  it('inicio/retraso/listo conservan estado financiero y replay no reinicia tiempos ni avisos', async () => {
    const iniciar = { accion: 'INICIAR', version: 0, minutos: 10 } as OperacionPreparacionDto;
    const primera = await servicio.operar('l', 'p', 'actor', 'uno', iniciar);
    expect(primera).toMatchObject({ preparacion: { estado: 'EN_PREPARACION', version: 1, estimadoListoEn: '2026-11-07T12:10:00.000Z' } });
    expect(await servicio.operar('l', 'p', 'actor', 'uno', iniciar)).toEqual(primera);
    expect(m.insert).toHaveBeenCalledTimes(1);
    await expect(servicio.operar('l', 'p', 'actor', 'vieja', iniciar)).rejects.toMatchObject({ status: 409 });
    await servicio.operar('l', 'p', 'actor', 'dos', { accion: 'RETRASAR', version: 1, minutos: 5, motivo: 'Mayor tiempo de cocción' });
    expect(avance!.estimadoListoEn?.toISOString()).toBe('2026-11-07T12:15:00.000Z');
    await servicio.operar('l', 'p', 'actor', 'tres', { accion: 'LISTO', version: 2 });
    expect(avance!.estado).toBe('LISTO_PARA_ENTREGAR');
    expect(m.save.mock.calls.every(([clase]) => clase !== Pedido)).toBe(true);
    expect(historial.size).toBe(3);
  });
  it('una incidencia abierta impide marcar listo y una clave incompatible se rechaza', async () => {
    await servicio.operar('l', 'p', 'actor', 'uno', { accion: 'INICIAR', version: 0, minutos: 10 });
    m.count.mockResolvedValue(1);
    await expect(servicio.operar('l', 'p', 'actor', 'dos', { accion: 'LISTO', version: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(servicio.operar('l', 'p', 'otro', 'uno', { accion: 'INICIAR', version: 0, minutos: 10 })).rejects.toMatchObject({ status: 409 });
    expect(historial.size).toBe(1);
  });
  it.each([{ minutos: 0 }, { minutos: 241 }, { minutos: 1.5 }, { version: -1 }, { accion: 'ENTREGAR' }, { motivo: ' ' }])('valida límites %j', async cambio => {
    const errores = await validate(plainToInstance(OperacionPreparacionDto, { accion: 'INICIAR', version: 0, minutos: 10, ...cambio }));
    expect(errores.length).toBeGreaterThan(0);
  });
});
