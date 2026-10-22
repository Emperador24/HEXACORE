import Redis from 'ioredis';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { EstadoPedido, Pedido } from '../persistencia/entidades/pedido.entity';
import { EstadoReservaInventario, ReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';
import { EstadoTransaccionPedido, TransaccionPedido } from '../persistencia/entidades/transaccion-pedido.entity';
import { PreparacionInventarioService } from './preparacion-inventario.service';
import { PREPARAR_INVENTARIO_LUA } from './preparacion.scripts';
import { clavesReserva } from './reservas.service';

const establecimientoId = '30000000-0000-4000-8000-000000000001';
const productoId = '40000000-0000-4000-8000-000000000001';

describe('PreparacionInventarioService', () => {
  let servicio: PreparacionInventarioService;
  let evaluar: jest.Mock;
  let gestor: { exists: jest.Mock; find: jest.Mock };
  let transaction: jest.Mock;
  beforeEach(() => {
    gestor = {
      exists: jest.fn(async (tipo) => tipo === Establecimiento),
      find: jest.fn().mockResolvedValue([{ id: productoId, cantidadInventario: 0, precio: '25000.00', nombre: 'No copiar', activo: false }]),
    };
    transaction = jest.fn(async (_aislamiento, trabajo: (tx: EntityManager) => unknown) => trabajo(gestor as unknown as EntityManager));
    evaluar = jest.fn().mockResolvedValue('{"codigo":"OK"}');
    servicio = new PreparacionInventarioService({ transaction } as unknown as DataSource, { eval: evaluar } as unknown as Redis);
  });
  it('lee PostgreSQL en snapshot, incluye cero/inactivos y solo envía ID y cantidad a Lua', async () => {
    expect(await servicio.preparar(establecimientoId.toUpperCase())).toEqual({ establecimientoId, productosPreparados: 1 });
    expect(transaction.mock.calls[0][0]).toBe('REPEATABLE READ');
    expect(gestor.find).toHaveBeenCalledWith(Producto, {
      where: { establecimientoId }, select: { id: true, cantidadInventario: true }, order: { id: 'ASC' },
    });
    const [stock, , vencimientos, marca] = clavesReserva(establecimientoId, '');
    expect(evaluar).toHaveBeenCalledWith(PREPARAR_INVENTARIO_LUA, 3, stock, marca, vencimientos,
      establecimientoId, JSON.stringify([{ productoId, cantidadInventario: 0 }]));
    expect(JSON.stringify(evaluar.mock.calls)).not.toContain('25000.00');
  });
  it('consulta compromisos del establecimiento sin ignorar vencidos, inciertos o aprobaciones sin confirmar', async () => {
    await servicio.preparar(establecimientoId);
    expect(gestor.exists).toHaveBeenCalledWith(ReservaInventario, { where: {
      pedido: { establecimientoId }, estado: Not(In([EstadoReservaInventario.LIBERADA, EstadoReservaInventario.CONSUMIDA])),
    } });
    expect(gestor.exists).toHaveBeenCalledWith(Pedido, { where: { establecimientoId, estado: EstadoPedido.PENDIENTE_PAGO } });
    expect(gestor.exists).toHaveBeenCalledWith(TransaccionPedido, { where: [
      { pedido: { establecimientoId }, estado: In([EstadoTransaccionPedido.PENDIENTE, EstadoTransaccionPedido.FALLIDA]) },
      { pedido: { establecimientoId, estado: Not(EstadoPedido.CONFIRMADO) }, estado: EstadoTransaccionPedido.APROBADA },
    ] });
  });
  it.each([ReservaInventario, Pedido, TransaccionPedido])('un compromiso persistente impide tocar Redis (%p)', async (tipoComprometido) => {
    gestor.exists.mockImplementation(async (tipo) => tipo === Establecimiento || tipo === tipoComprometido);
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ status: 409, response: { codigo: 'COMPROMISOS_INVENTARIO_PENDIENTES' } });
    expect(evaluar).not.toHaveBeenCalled();
    expect(gestor.find).not.toHaveBeenCalled();
  });
  it('rechaza establecimiento inexistente', async () => {
    gestor.exists.mockResolvedValue(false);
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ status: 404 });
    expect(evaluar).not.toHaveBeenCalled();
  });
  it('rechaza UUID inválido sin abrir la transacción', async () => {
    await expect(servicio.preparar('incorrecto')).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rechaza un catálogo vacío sin dejar una marca que aparenta estar listo', async () => {
    gestor.find.mockResolvedValue([]);
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ response: { codigo: 'ESTABLECIMIENTO_SIN_PRODUCTOS' } });
    expect(evaluar).not.toHaveBeenCalled();
  });
  it.each([-1, 1.5, 2147483648, NaN, '2'])('rechaza inventario inválido %s', async (cantidadInventario) => {
    gestor.find.mockResolvedValue([{ id: productoId, cantidadInventario }]);
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ status: 409 });
    expect(evaluar).not.toHaveBeenCalled();
  });
  it('rechaza inventario Redis existente', async () => {
    evaluar.mockResolvedValue('{"codigo":"INVENTARIO_YA_EXISTENTE"}');
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ status: 409, response: { codigo: 'INVENTARIO_YA_EXISTENTE' } });
  });
  it('fallo PostgreSQL nunca inicializa Redis', async () => {
    transaction.mockRejectedValue(new Error('DB no disponible'));
    await expect(servicio.preparar(establecimientoId)).rejects.toThrow();
    expect(evaluar).not.toHaveBeenCalled();
  });
  it('timeout no borra ni reintenta la preparación', async () => {
    evaluar.mockRejectedValue(new Error('Redis timeout'));
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ response: { codigo: 'PREPARACION_RESULTADO_INCIERTO' } });
    expect(evaluar).toHaveBeenCalledTimes(1);
  });
  it.each(['null', 'no-json', '{}'])('controla respuesta Redis malformada %s', async (respuesta) => {
    evaluar.mockResolvedValue(respuesta);
    await expect(servicio.preparar(establecimientoId)).rejects.toMatchObject({ status: 503 });
  });
});
