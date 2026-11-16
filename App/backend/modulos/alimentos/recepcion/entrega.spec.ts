import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { ConsultaPersonal } from '../../identidad/consulta-personal.module';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { PersonalEstablecimiento } from '../persistencia/entidades/personal-establecimiento.entity';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { TransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { PreparacionPedido, HistorialPreparacion } from '../persistencia/entidades/preparacion-pedido.entity';
import { EntregaPedido } from '../persistencia/entidades/entrega-pedido.entity';
import { ConfirmarEntregaDto, PrevalidarEntregaDto } from './entrega.dto';
import { EntregaService, revisionPunto } from './entrega.service';

describe('CU-014: entrega autorizada y única', () => {
  const qr = 'a'.repeat(64), fecha = '2026-11-08T05:00:00.000Z';
  let pedido: any, avance: any, entregado: any, vinculo: boolean, incidencias: number, pagado: boolean;
  const historial = new Map<string, any>();
  const cuentas = { bloquearPersonalActivo: jest.fn() };
  const qb = { where: jest.fn(), andWhere: jest.fn(), setLock: jest.fn(), getOne: jest.fn() };
  const m = { findOne: jest.fn(), findOneBy: jest.fn(), find: jest.fn(), count: jest.fn(), exists: jest.fn(),
    create: jest.fn(), query: jest.fn(), save: jest.fn(), insert: jest.fn(), createQueryBuilder: jest.fn() };
  let servicio: EntregaService;
  const datos = () => ({ pedidoId: 'pedido', version: 2, puntoRevision: revisionPunto('local', 'Puerta uno'), codigoQr: qr });
  beforeEach(() => {
    jest.resetAllMocks(); historial.clear(); vinculo = true; incidencias = 0; pagado = true; entregado = null;
    pedido = { id: 'pedido', establecimientoId: 'local', estado: EstadoPedido.CONFIRMADO, codigoQr: qr, total: '1000.25', moneda: 'COP' };
    avance = { pedidoId: 'pedido', estado: 'LISTO_PARA_ENTREGAR', version: 2, iniciadoEn: new Date(fecha), estimadoListoEn: new Date(fecha), listoEn: new Date(fecha) };
    cuentas.bloquearPersonalActivo.mockResolvedValue(true);
    m.findOne.mockImplementation(async (tipo) => tipo === Pedido ? pedido : tipo === PersonalEstablecimiento ? vinculo ? {} : null : tipo === Establecimiento ? { id: 'local', puntoEntrega: 'Puerta uno' } : null);
    m.findOneBy.mockImplementation(async (tipo, d) => tipo === HistorialPreparacion ? historial.get(d.id) : tipo === PreparacionPedido ? avance : null);
    m.exists.mockImplementation(async tipo => tipo === EntregaPedido && !!entregado);
    m.find.mockImplementation(async tipo => tipo === TransaccionPedido ? pagado ? [{ pedidoId: 'pedido', estado: 'APROBADA', monto: '1000.25', moneda: 'COP' }] : [] : tipo === DetallePedido ? [{ nombreProducto: 'Receta histórica', cantidad: 1, precioUnitario: '1000.25' }] : []);
    m.count.mockImplementation(async () => incidencias); m.create.mockImplementation((_t, d) => d);
    m.query.mockResolvedValue([{ ahora: new Date(fecha) }]); m.save.mockImplementation(async (_t, d) => d);
    m.insert.mockImplementation(async (tipo, d) => { if (tipo === HistorialPreparacion) historial.set(d.id, d); if (tipo === EntregaPedido) entregado = d; });
    for (const fn of ['where', 'andWhere', 'setLock'] as const) qb[fn].mockReturnValue(qb);
    qb.getOne.mockImplementation(async () => pedido); m.createQueryBuilder.mockReturnValue(qb);
    servicio = new EntregaService({ transaction: (f: any) => f(m) } as unknown as DataSource, cuentas as unknown as ConsultaPersonal);
  });
  it('prevalidar es repetible, no consume ni escribe y nunca manda el QR como parámetro SQL', async () => {
    const primera = await servicio.prevalidar('local', 'actor', qr);
    expect(primera).toMatchObject({ pedidoId: 'pedido', version: 2, puntoEntrega: 'Puerta uno', productos: [{ nombreProducto: 'Receta histórica' }] });
    expect(await servicio.prevalidar('local', 'actor', qr)).toEqual(primera);
    expect(m.insert).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
    expect(JSON.stringify(qb.andWhere.mock.calls)).not.toContain(qr);
    expect(JSON.stringify(qb.andWhere.mock.calls)).toContain(createHash('sha256').update(qr).digest('hex'));
    entregado = { pedidoId: 'pedido' };
    await expect(servicio.prevalidar('local', 'actor', qr)).rejects.toMatchObject({ response: { codigo: 'PEDIDO_YA_ENTREGADO' } });
  });
  it('confirma fecha/actor/punto e historial una vez; replay sin guardar QR y sin tocar Pedido', async () => {
    const original = await servicio.confirmar('local', 'actor', 'op', datos());
    expect(original).toMatchObject({ estadoOperativo: 'ENTREGADO', qrUtilizable: false, creadoEn: fecha, entrega: { entregadoEn: fecha, puntoEntrega: 'Puerta uno' } });
    expect(entregado).toMatchObject({ actorId: 'actor', establecimientoId: 'local', operacionId: 'op' });
    expect(cuentas.bloquearPersonalActivo).toHaveBeenCalledWith('actor', m);
    expect(await servicio.confirmar('local', 'actor', 'op', { ...datos(), codigoQr: undefined })).toEqual(original);
    expect(m.insert).toHaveBeenCalledTimes(2); expect(avance.version).toBe(3);
    expect(m.save.mock.calls.every(([t]) => t !== Pedido)).toBe(true);
    expect(JSON.stringify([...historial.values()])).not.toContain(qr);
    await expect(servicio.confirmar('local', 'actor', 'otra', { ...datos(), version: 3 })).rejects.toMatchObject({ response: { codigo: 'PEDIDO_YA_ENTREGADO' } });
    await expect(servicio.confirmar('local', 'actor', 'op', { ...datos(), codigoQr: 'b'.repeat(64) })).rejects.toMatchObject({ response: { codigo: 'CLAVE_ENTREGA_INCOMPATIBLE' } });
  });
  it('recuperar sin código nunca autoriza una entrega nueva', async () => {
    await expect(servicio.confirmar('local', 'actor', 'op', { ...datos(), codigoQr: undefined })).rejects.toMatchObject({ response: { codigo: 'QR_REQUERIDO' } });
    expect(m.insert).not.toHaveBeenCalled();
  });
  it.each([EstadoPedido.CANCELADO, EstadoPedido.EXPIRADO, EstadoPedido.PENDIENTE_PAGO])('rechaza %s aun con aprobación previa', async estado => {
    pedido.estado = estado;
    await expect(servicio.confirmar('local', 'actor', 'op', datos())).rejects.toMatchObject({ status: 409 });
    expect(m.insert).not.toHaveBeenCalled();
  });
  it('revalida pago, listo, incidencias, versión, punto y autenticidad al confirmar', async () => {
    pagado = false; await expect(servicio.confirmar('local', 'actor', 'op', datos())).rejects.toMatchObject({ response: { codigo: 'PEDIDO_NO_PAGADO' } }); pagado = true;
    avance.estado = 'EN_PREPARACION'; await expect(servicio.confirmar('local', 'actor', 'op', datos())).rejects.toMatchObject({ response: { codigo: 'PEDIDO_NO_LISTO' } }); avance.estado = 'LISTO_PARA_ENTREGAR';
    incidencias = 1; await expect(servicio.confirmar('local', 'actor', 'op', datos())).rejects.toMatchObject({ response: { codigo: 'INCIDENCIAS_PENDIENTES' } }); incidencias = 0;
    await expect(servicio.confirmar('local', 'actor', 'op', { ...datos(), version: 0 })).rejects.toMatchObject({ response: { codigo: 'VERSION_PREPARACION_DESACTUALIZADA' } });
    await expect(servicio.confirmar('local', 'actor', 'op', { ...datos(), puntoRevision: 'x' })).rejects.toMatchObject({ response: { codigo: 'PUNTO_ENTREGA_CAMBIO' } });
    await expect(servicio.confirmar('local', 'actor', 'op', { ...datos(), codigoQr: 'b'.repeat(64) })).rejects.toMatchObject({ status: 404 });
    expect(m.insert).not.toHaveBeenCalled();
  });
  it('una cuenta desactivada o vínculo revocado se rechaza incluso al repetir una operación', async () => {
    await servicio.confirmar('local', 'actor', 'op', datos());
    cuentas.bloquearPersonalActivo.mockResolvedValue(false);
    await expect(servicio.confirmar('local', 'actor', 'op', datos())).rejects.toMatchObject({ status: 403 });
    cuentas.bloquearPersonalActivo.mockResolvedValue(true); vinculo = false;
    await expect(servicio.confirmar('local', 'actor', 'op', datos())).rejects.toMatchObject({ status: 403 });
  });
  it.each([{ codigoQr: null }, { codigoQr: '123456' }, { codigoQr: 'g'.repeat(64) }, { version: -1 }, { puntoRevision: null }, { estado: 'CONFIRMADO' }])('rechaza datos no válidos %j', async cambio => {
    expect((await validate(plainToInstance(ConfirmarEntregaDto, { ...datos(), pedidoId: '8c7624d1-6c3a-4a81-880a-1f1f70000001', ...cambio }), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
  it('solo normaliza espacios y mayúsculas del código completo', async () => {
    const d = plainToInstance(PrevalidarEntregaDto, { codigoQr: ` ${qr.toUpperCase()} ` });
    expect(await validate(d)).toEqual([]); expect(d.codigoQr).toBe(qr);
  });
});
