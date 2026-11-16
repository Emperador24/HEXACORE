import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { ReservaInventario, EstadoReservaInventario as Reserva } from '../persistencia/entidades/reserva-inventario.entity';
import { EstadoTransaccionPedido as Pago } from '../persistencia/entidades/transaccion-pedido.entity';
import { ReservasService } from './reservas.service';
import { ExpiracionReservasService } from './expiracion-reservas.service';

describe('Expiración y liberación de reservas', () => {
  let pedido: Pedido;
  let reserva: ReservaInventario;
  let pagos: Pago[];
  let enTransaccion: boolean;
  let falloCommit: boolean;
  let stockDevuelto: number;
  let redisLiberada: boolean;
  let servicio: ExpiracionReservasService;
  let gestor: { findOne: jest.Mock; exists: jest.Mock; save: jest.Mock };
  let manager: { find: jest.Mock; update: jest.Mock };
  let liberar: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    pedido = { id: 'pedido', establecimientoId: 'local', estado: EstadoPedido.PENDIENTE_PAGO,
      expiraEn: new Date(Date.now() - 1000) } as Pedido;
    reserva = { pedidoId: pedido.id, estado: Reserva.ACTIVA } as ReservaInventario;
    pagos = [];
    enTransaccion = false;
    falloCommit = false;
    stockDevuelto = 0;
    redisLiberada = false;
    gestor = {
      findOne: jest.fn(async (tipo) => tipo === Pedido ? pedido : reserva),
      exists: jest.fn(async (_tipo, opciones) => pagos.some((estado) => opciones.where.estado.value.includes(estado))),
      save: jest.fn(async (_tipo, entidad) => entidad),
    };
    manager = {
      // También entrega candidatos obsoletos: el bloqueo debe volver a comprobarlos.
      find: jest.fn(async () => [{ pedidoId: 'pedido' }]),
      update: jest.fn(async (_tipo, filtro, cambio) => {
        if (reserva.estado === filtro.estado) Object.assign(reserva, cambio);
        return { affected: 1 };
      }),
    };
    const transaction = jest.fn(async (operacion) => {
      const anterior = structuredClone({ pedido, reserva });
      enTransaccion = true;
      try {
        const resultado = await operacion(gestor);
        if (falloCommit) throw new Error('Commit fallido');
        return resultado;
      } catch (error) {
        pedido = anterior.pedido;
        reserva = anterior.reserva;
        throw error;
      } finally { enTransaccion = false; }
    });
    liberar = jest.fn(async () => {
      expect(enTransaccion).toBe(false);
      expect(pedido.estado).toBe(EstadoPedido.EXPIRADO);
      expect(reserva.estado).toBe(Reserva.LIBERACION_PENDIENTE);
      const repetida = redisLiberada;
      if (!redisLiberada) stockDevuelto += 3;
      redisLiberada = true;
      return { estado: 'LIBERADA', repetida, expiraEn: pedido.expiraEn };
    });
    servicio = new ExpiracionReservasService({ manager, transaction } as unknown as DataSource,
      { liberar } as unknown as ReservasService);
  });

  afterEach(async () => {
    await servicio.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('expira bajo bloqueo, libera después del commit y conserva el vencimiento', async () => {
    const expiraEn = pedido.expiraEn;
    await servicio.ejecutarCiclo();
    expect(gestor.findOne).toHaveBeenCalledWith(Pedido, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(gestor.findOne).toHaveBeenCalledWith(ReservaInventario, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(liberar).toHaveBeenCalledWith('local', 'pedido');
    expect(reserva.estado).toBe(Reserva.LIBERADA);
    expect(pedido.expiraEn).toBe(expiraEn);
    expect(stockDevuelto).toBe(3);
  });

  it.each([Pago.APROBADA, Pago.PENDIENTE, Pago.FALLIDA])('no expira ni libera con pago %s', async (estado) => {
    pagos = [Pago.RECHAZADA, estado];
    await servicio.ejecutarCiclo();
    expect(pedido.estado).toBe(EstadoPedido.PENDIENTE_PAGO);
    expect(reserva.estado).toBe(Reserva.ACTIVA);
    expect(liberar).not.toHaveBeenCalled();
  });

  it('permite expirar cuando todos los intentos fueron rechazados', async () => {
    pagos = [Pago.RECHAZADA];
    await servicio.ejecutarCiclo();
    expect(reserva.estado).toBe(Reserva.LIBERADA);
  });

  it('no expira antes de expiraEn', async () => {
    pedido.expiraEn = new Date(Date.now() + 600000);
    await servicio.ejecutarCiclo();
    expect(gestor.save).not.toHaveBeenCalled();
    expect(liberar).not.toHaveBeenCalled();
  });

  it.each([EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO])('no libera pedidos %s', async (estado) => {
    pedido.estado = estado;
    await servicio.ejecutarCiclo();
    expect(liberar).not.toHaveBeenCalled();
  });

  it('libera reservas de pedidos ya expirados por pagos', async () => {
    pedido.estado = EstadoPedido.EXPIRADO;
    await servicio.ejecutarCiclo();
    expect(reserva.estado).toBe(Reserva.LIBERADA);
  });

  it('no libera Redis si falla la transacción PostgreSQL', async () => {
    falloCommit = true;
    await servicio.ejecutarCiclo();
    expect(liberar).not.toHaveBeenCalled();
    expect(pedido.estado).toBe(EstadoPedido.PENDIENTE_PAGO);
    expect(reserva.estado).toBe(Reserva.ACTIVA);
  });

  it('conserva la expiración ante fallo Redis y reintenta la liberación pendiente', async () => {
    liberar.mockRejectedValueOnce(new Error('Redis no disponible'));
    await servicio.ejecutarCiclo();
    expect(pedido.estado).toBe(EstadoPedido.EXPIRADO);
    expect(reserva.estado).toBe(Reserva.LIBERACION_PENDIENTE);
    expect(manager.update).not.toHaveBeenCalled();
    await servicio.ejecutarCiclo();
    expect(reserva.estado).toBe(Reserva.LIBERADA);
    expect(stockDevuelto).toBe(3);
  });

  it('no devuelve stock dos veces si falla guardar LIBERADA tras liberar Redis', async () => {
    manager.update.mockRejectedValueOnce(new Error('PostgreSQL no disponible'));
    await servicio.ejecutarCiclo();
    expect(reserva.estado).toBe(Reserva.LIBERACION_PENDIENTE);
    await servicio.ejecutarCiclo();
    await servicio.ejecutarCiclo();
    expect(liberar).toHaveBeenCalledTimes(2);
    expect(stockDevuelto).toBe(3);
    expect(reserva.estado).toBe(Reserva.LIBERADA);
  });

  it('vuelve a comprobar pagos antes de reintentar una liberación pendiente', async () => {
    pedido.estado = EstadoPedido.EXPIRADO;
    reserva.estado = Reserva.LIBERACION_PENDIENTE;
    pagos = [Pago.APROBADA];
    await servicio.ejecutarCiclo();
    expect(liberar).not.toHaveBeenCalled();
  });

  it('no marca LIBERADA si Redis no confirma la liberación', async () => {
    liberar.mockResolvedValueOnce({ estado: 'CONSUMIDA' });
    await servicio.ejecutarCiclo();
    expect(reserva.estado).toBe(Reserva.LIBERACION_PENDIENTE);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('ejecuta periódicamente sin solaparse y detiene el temporizador al cerrar', async () => {
    jest.useFakeTimers();
    let continuar!: () => void;
    manager.find.mockImplementationOnce(() => new Promise((resolve) => { continuar = () => resolve([]); }));
    servicio.onModuleInit();
    await jest.advanceTimersByTimeAsync(15000);
    expect(manager.find).toHaveBeenCalledTimes(1);
    continuar();
    await servicio.ejecutarCiclo();
    await jest.advanceTimersByTimeAsync(5000);
    expect(manager.find).toHaveBeenCalledTimes(2);
    await servicio.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10000);
    expect(manager.find).toHaveBeenCalledTimes(2);
  });
});
