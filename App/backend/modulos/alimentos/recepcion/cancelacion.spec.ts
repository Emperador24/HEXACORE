import { DataSource } from 'typeorm';
import { CancelacionService } from './cancelacion.service';
import { ClienteReembolsos } from './cliente-reembolsos.service';
import { ConsultaPersonal } from '../../identidad/consulta-personal.module';
import { AjustesInventarioService } from '../inventario/ajustes-inventario.service';
import { ReservasService } from '../inventario/reservas.service';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { PersonalEstablecimiento } from '../persistencia/entidades/personal-establecimiento.entity';
import { TransaccionPedido, EstadoTransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { PreparacionPedido, HistorialPreparacion } from '../persistencia/entidades/preparacion-pedido.entity';
import { EntregaPedido } from '../persistencia/entidades/entrega-pedido.entity';
import { CancelacionPedido } from '../persistencia/entidades/cancelacion-pedido.entity';
import { OperacionInventario } from '../persistencia/entidades/operacion-inventario.entity';
import { ReservaInventario, EstadoReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';
import { randomUUID } from 'node:crypto';

const actor = randomUUID(), local = randomUUID(), pedidoId = randomUUID(), clave = randomUUID(), cobroId = randomUUID();
function entorno() {
  const pedido = { id: pedidoId, establecimientoId: local, estado: EstadoPedido.CONFIRMADO, total: '1000.25', moneda: 'COP', codigoQr: 'qr-original' };
  const pago = { id: cobroId, pedidoId, estado: EstadoTransaccionPedido.APROBADA, monto: '1000.25', moneda: 'COP', referenciaPasarela: `pas_${randomUUID()}` };
  const reserva = { pedidoId, estado: EstadoReservaInventario.CONSUMIDA };
  const preparacion = { pedidoId, estado: 'RECIBIDO', version: 0, iniciadoEn: null, estimadoListoEn: null, listoEn: null };
  const historial = new Map<string, any>(), cancelaciones = new Map<string, any>(), inventario: any[] = [];
  const flags = { vinculada: true, entregado: false, historialPreparado: false };
  const cuentas = { bloquearPersonalActivo: jest.fn().mockResolvedValue(true) };
  let profundidad = 0;
  const m: any = {
    create: (_: unknown, d: any) => ({ ...d }),
    findOne: jest.fn(async (t: unknown) => t === Pedido ? pedido : t === PersonalEstablecimiento ? flags.vinculada ? {} : null : t === Establecimiento ? { id: local, estado: 'CERRADO' } : t === ReservaInventario ? reserva : null),
    findOneBy: jest.fn(async (t: unknown, w: any) => t === HistorialPreparacion ? historial.get(w.id) : t === PreparacionPedido ? preparacion : t === CancelacionPedido ? cancelaciones.get(pedidoId) : t === ReservaInventario ? reserva : null),
    exists: jest.fn(async (t: unknown) => t === EntregaPedido ? flags.entregado : t === HistorialPreparacion ? flags.historialPreparado : false),
    find: jest.fn(async (t: unknown) => t === TransaccionPedido ? [pago] : t === DetallePedido ? [{ productoId: randomUUID(), cantidad: 2 }] : t === OperacionInventario ? inventario : []),
    query: jest.fn(async () => [{ ahora: new Date('2026-11-11T22:00:00Z') }]),
    save: jest.fn(async (_: unknown, d: any) => d),
    insert: jest.fn(async (t: unknown, d: any) => {
      if (t === HistorialPreparacion) historial.set(d.id, d);
      if (t === CancelacionPedido) cancelaciones.set(d.pedidoId, d);
      if (t === OperacionInventario) inventario.push(d);
    }),
    update: jest.fn(async (t: unknown, where: any, changes: any) => {
      if (t === Pedido) Object.assign(pedido, changes);
      if (t === CancelacionPedido) {
        const c = cancelaciones.get(pedidoId);
        if (where.intentadoEn && (c.intentadoEn || c.estadoReembolso !== 'PENDIENTE')) return { affected: 0 };
        Object.assign(c, changes);
      }
      return { affected: 1 };
    }),
  };
  m.findOneOrFail = jest.fn(async (t: unknown, o: any) => t === CancelacionPedido ? cancelaciones.get(pedidoId) : m.findOne(t, o));
  m.findOneByOrFail = jest.fn(async (t: unknown, w: any) => m.findOneBy(t, w));
  const datos = { manager: m, transaction: async (fn: (m: any) => Promise<any>) => { profundidad++; try { return await fn(m); } finally { profundidad--; } } } as unknown as DataSource;
  const finanzas = { solicitar: jest.fn(), consultar: jest.fn() };
  const ajustes = { recuperarEstablecimiento: jest.fn() }, reservas = { consumir: jest.fn() };
  const servicio = new CancelacionService(datos, cuentas as unknown as ConsultaPersonal, finanzas as unknown as ClienteReembolsos,
    ajustes as unknown as AjustesInventarioService, reservas as unknown as ReservasService);
  return { servicio, m, pedido, pago, reserva, preparacion, historial, cancelaciones, inventario, flags, cuentas, finanzas,
    profundidad: () => profundidad, ajustes, reservas };
}

describe('CU-011F transición y política conservadora', () => {
  let e: ReturnType<typeof entorno>;
  const dto = { version: 0, motivo: 'No podemos preparar lo acordado', confirmar: true };
  beforeEach(() => { e = entorno(); jest.spyOn(e.servicio, 'procesar').mockResolvedValue(); });
  it('cancela cerrado, conserva pago/QR histórico y registra una intención de restitución y aviso', async () => {
    const pago = { ...e.pago };
    const r = await e.servicio.cancelar(local, pedidoId, actor, clave, dto);
    expect(r).toMatchObject({ operacionId: clave, motivo: dto.motivo, reembolso: { estado: 'PENDIENTE', monto: '1000.25', moneda: 'COP' }, inventario: 'PENDIENTE' });
    expect(e.pedido.estado).toBe('CANCELADO'); expect(e.pedido.codigoQr).toBe('qr-original'); expect(e.pago).toEqual(pago);
    expect(e.inventario).toHaveLength(1); expect(e.inventario[0]).toMatchObject({ tipo: 'AJUSTE', delta: 2, inicializa: false });
    expect(e.historial.get(clave).aviso).toContain(dto.motivo);
    expect(e.cuentas.bloquearPersonalActivo).toHaveBeenCalledWith(actor, e.m);
    expect(e.cancelaciones.get(pedidoId)).toMatchObject({ cobroId, referenciaCobro: pago.referenciaPasarela });
    expect(e.finanzas.solicitar).not.toHaveBeenCalled();
  });
  it('replay conserva la cancelación y no duplica intenciones; otra petición/clave se rechaza', async () => {
    const a = await e.servicio.cancelar(local, pedidoId, actor, clave, dto);
    expect(await e.servicio.cancelar(local, pedidoId, actor, clave, dto)).toEqual(a);
    expect(e.inventario).toHaveLength(1); expect(e.historial.size).toBe(1);
    await expect(e.servicio.cancelar(local, pedidoId, actor, clave, { ...dto, motivo: 'Otro motivo' })).rejects.toMatchObject({ status: 409 });
    await expect(e.servicio.cancelar(local, pedidoId, actor, randomUUID(), dto)).rejects.toMatchObject({ status: 409 });
  });
  it.each(['cuenta', 'vinculo'])('revalida %s incluso para recuperar una operación', async tipo => {
    await e.servicio.cancelar(local, pedidoId, actor, clave, dto);
    if (tipo === 'cuenta') e.cuentas.bloquearPersonalActivo.mockResolvedValue(false); else e.flags.vinculada = false;
    await expect(e.servicio.cancelar(local, pedidoId, actor, clave, dto)).rejects.toMatchObject({ status: 403 });
  });
  it.each([{ ...dto, confirmar: false }, { ...dto, motivo: ' ' }, { ...dto, version: -1 }])('exige motivo y confirmación explícita: %j', async d => {
    await expect(e.servicio.cancelar(local, pedidoId, actor, clave, d)).rejects.toMatchObject({ status: 400 });
    expect(e.m.insert).not.toHaveBeenCalled();
  });
  it.each(['entregado','version','pago'])('rechaza %s revalidado al ejecutar', async tipo => {
    if (tipo === 'entregado') e.flags.entregado = true;
    if (tipo === 'version') e.preparacion.version = 1;
    if (tipo === 'pago') e.pago.estado = EstadoTransaccionPedido.FALLIDA;
    await expect(e.servicio.cancelar(local, pedidoId, actor, clave, dto)).rejects.toMatchObject({ status: 409 });
    expect(e.inventario).toHaveLength(0); expect(e.historial.size).toBe(0);
  });
  it.each(['EN_PREPARACION','LISTO_PARA_ENTREGAR'])('cancela %s sin reincorporar comida', async estado => {
    e.preparacion.estado = estado;
    expect(await e.servicio.cancelar(local, pedidoId, actor, clave, dto)).toMatchObject({ inventario: 'NO_REINCORPORAR' });
    expect(e.inventario).toHaveLength(0);
  });
  it('no libera una reserva ACTIVA ni repone inventario ambiguo', async () => {
    e.reserva.estado = EstadoReservaInventario.ACTIVA;
    expect(await e.servicio.cancelar(local, pedidoId, actor, clave, dto)).toMatchObject({ inventario: 'REVISION' });
    expect(e.inventario).toHaveLength(0); expect(e.reservas.consumir).not.toHaveBeenCalled();
  });
  it('acepta consumo pendiente como físico ya descontado; nunca pide liberación', async () => {
    e.reserva.estado = EstadoReservaInventario.CONSUMO_PENDIENTE;
    await e.servicio.cancelar(local, pedidoId, actor, clave, dto);
    expect(e.inventario[0].delta).toBe(2); expect(e.reserva.estado).toBe('CONSUMO_PENDIENTE');
  });
  it('no repone un RECIBIDO contradictorio con historial de preparación', async () => {
    e.flags.historialPreparado = true;
    expect(await e.servicio.cancelar(local, pedidoId, actor, clave, dto)).toMatchObject({ inventario: 'REVISION' });
    expect(e.inventario).toHaveLength(0);
  });
});

describe('CU-011F seguimiento de dinero sin reenviar incertidumbre', () => {
  let e: ReturnType<typeof entorno>;
  beforeEach(async () => {
    e = entorno(); const spy = jest.spyOn(e.servicio, 'procesar').mockResolvedValue();
    await e.servicio.cancelar(local, pedidoId, actor, clave, { version: 0, motivo: 'Cancelación de prueba', confirmar: true });
    spy.mockRestore(); e.cancelaciones.get(pedidoId).estadoInventario = 'NO_REINCORPORAR';
  });
  it.each(['APROBADO','RECHAZADO'])('guarda %s y llama a Finanzas sin bloqueos/transacción SQL abierta', async resultado => {
    const ref = resultado === 'APROBADO' ? `ree_${randomUUID()}` : null;
    e.finanzas.solicitar.mockImplementation(async c => {
      expect(e.profundidad()).toBe(0); expect(c).toMatchObject({ cobroId, monto: '1000.25', moneda: 'COP' });
      return { resultado, referencia: ref };
    });
    await e.servicio.procesar(pedidoId);
    expect(e.cancelaciones.get(pedidoId)).toMatchObject({ estadoReembolso: resultado, referenciaReembolso: ref });
    expect(e.pedido.estado).toBe('CANCELADO'); expect(e.finanzas.solicitar).toHaveBeenCalledTimes(1);
  });
  it('timeout/error conserva la misma clave y consulta después, sin otra solicitud', async () => {
    e.finanzas.solicitar.mockRejectedValue(new Error('respuesta perdida'));
    e.finanzas.consultar.mockResolvedValue(null);
    const id = e.cancelaciones.get(pedidoId).reembolsoId;
    await e.servicio.procesar(pedidoId); await e.servicio.procesar(pedidoId);
    expect(e.cancelaciones.get(pedidoId).estadoReembolso).toBe('INCIERTO');
    expect(e.cancelaciones.get(pedidoId).reembolsoId).toBe(id); expect(e.finanzas.solicitar).toHaveBeenCalledTimes(1);
    e.finanzas.consultar.mockResolvedValue({ resultado: 'APROBADO', referencia: 'ree_confirmada' });
    await e.servicio.procesar(pedidoId);
    expect(e.cancelaciones.get(pedidoId).estadoReembolso).toBe('APROBADO'); expect(e.finanzas.solicitar).toHaveBeenCalledTimes(1);
  });
  it('reinicio después del claim no reenvía aunque el libro financiero no tenga respuesta', async () => {
    e.cancelaciones.get(pedidoId).intentadoEn = new Date(); e.finanzas.consultar.mockResolvedValue(null);
    await e.servicio.procesar(pedidoId);
    expect(e.finanzas.solicitar).not.toHaveBeenCalled(); expect(e.cancelaciones.get(pedidoId).estadoReembolso).toBe('INCIERTO');
  });
  it('aprobación sin referencia no acredita dinero devuelto', async () => {
    e.finanzas.solicitar.mockResolvedValue({ resultado: 'APROBADO', referencia: null });
    await e.servicio.procesar(pedidoId);
    expect(e.cancelaciones.get(pedidoId).estadoReembolso).toBe('INCIERTO');
  });
  it('un fallo de lectura posterior no degrada aprobación confirmada ni crea otra cancelación', async () => {
    e.finanzas.solicitar.mockResolvedValue({ resultado: 'APROBADO', referencia: 'ree_confirmada' });
    await e.servicio.procesar(pedidoId); e.finanzas.consultar.mockRejectedValue(new Error('SQL no disponible'));
    await e.servicio.procesar(pedidoId);
    expect(e.cancelaciones.get(pedidoId).estadoReembolso).toBe('APROBADO'); expect(e.historial.get(clave).accion).toBe('CANCELAR');
  });
});
