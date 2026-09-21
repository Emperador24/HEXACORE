import Redis from 'ioredis';
import { clavesReserva, ReservasService, SolicitudReserva } from './reservas.service';
import { CERRAR_LUA, RESERVAR_LUA } from './reservas.scripts';
import { InventarioModule } from './inventario.module';

const pedidoId = '60000000-0000-4000-8000-000000000001';
const establecimientoId = '30000000-0000-4000-8000-000000000001';
const productoId = '40000000-0000-4000-8000-000000000001';
const otroProducto = '40000000-0000-4000-8000-000000000002';
const expiraEn = new Date('2030-01-01T00:00:00Z');
const entrada = (): SolicitudReserva => ({ pedidoId, establecimientoId, expiraEn, productos: [{ productoId, cantidad: 2 }] });

describe('ReservasService', () => {
  let evaluar: jest.Mock;
  let servicio: ReservasService;
  beforeEach(() => {
    evaluar = jest.fn().mockResolvedValue(JSON.stringify({ codigo: 'OK', estado: 'ACTIVA', expiraEn: expiraEn.getTime(), repetida: false }));
    servicio = new ReservasService({ eval: evaluar } as unknown as Redis);
  });
  it('normaliza UUID, ordena productos y proyecta únicamente cantidades e identificadores', async () => {
    const datos = { ...entrada(), pedidoId: pedidoId.toUpperCase(), productos: [{ productoId: otroProducto, cantidad: 3 }, { productoId: productoId.toUpperCase(), cantidad: 2, precio: '12.00', token: 'NO_PERSISTIR' }] };
    expect(await servicio.reservar(datos)).toEqual({ estado: 'ACTIVA', expiraEn, repetida: false });
    expect(evaluar).toHaveBeenCalledWith(RESERVAR_LUA, 3, ...clavesReserva(establecimientoId, pedidoId), establecimientoId, pedidoId,
      JSON.stringify([{ productoId, cantidad: 2 }, { productoId: otroProducto, cantidad: 3 }]), String(expiraEn.getTime()));
    expect(JSON.stringify(evaluar.mock.calls)).not.toContain('NO_PERSISTIR');
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, '2'])('rechaza cantidad %s antes de Redis', async (cantidad) => {
    await expect(servicio.reservar({ ...entrada(), productos: [{ productoId, cantidad: cantidad as number }] })).rejects.toMatchObject({ status: 400 });
    expect(evaluar).not.toHaveBeenCalled();
  });
  it.each([
    { pedidoId: 'incorrecto' }, { establecimientoId: 'incorrecto' }, { productos: [] },
    { productos: [{ productoId: 'incorrecto', cantidad: 1 }] }, { expiraEn: new Date(NaN) },
    { productos: [{ productoId, cantidad: 1 }, { productoId, cantidad: 2 }] },
  ])('rechaza entrada inválida', async (cambios) => {
    await expect(servicio.reservar({ ...entrada(), ...cambios })).rejects.toMatchObject({ status: 400 });
    expect(evaluar).not.toHaveBeenCalled();
  });
  it.each([
    ['INVENTARIO_INSUFICIENTE', 409], ['RESERVA_INCOMPATIBLE', 409], ['RESERVA_CERRADA', 409],
    ['INVENTARIO_NO_PREPARADO', 503], ['DATOS_INCONSISTENTES', 503], ['RESERVA_NO_ENCONTRADA', 404], ['VENCIMIENTO_INVALIDO', 400],
  ])('traduce %s', async (codigo, status) => {
    evaluar.mockResolvedValue(JSON.stringify({ codigo }));
    await expect(servicio.reservar(entrada())).rejects.toMatchObject({ status, response: { codigo } });
  });
  it('timeout no significa operación fallida ni causa un reenvío del servicio', async () => {
    evaluar.mockRejectedValue(new Error('contenido arbitrario'));
    await expect(servicio.reservar(entrada())).rejects.toMatchObject({ status: 503, response: { codigo: 'RESERVA_RESULTADO_INCIERTO' } });
    expect(evaluar).toHaveBeenCalledTimes(1);
  });
  it.each(['no-json', 'null', '{}', '{"codigo":"OK"}'])('rechaza respuesta inválida %s', async (respuesta) => {
    evaluar.mockResolvedValue(respuesta);
    await expect(servicio.reservar(entrada())).rejects.toMatchObject({ status: 503 });
  });
  it('liberar y consumir usan el script de cierre con destinos distintos', async () => {
    await servicio.liberar(establecimientoId, pedidoId);
    await servicio.consumir(establecimientoId, pedidoId);
    expect(evaluar).toHaveBeenNthCalledWith(1, CERRAR_LUA, 3, ...clavesReserva(establecimientoId, pedidoId), establecimientoId, pedidoId, 'LIBERADA');
    expect(evaluar).toHaveBeenNthCalledWith(2, CERRAR_LUA, 3, ...clavesReserva(establecimientoId, pedidoId), establecimientoId, pedidoId, 'CONSUMIDA');
  });
  it('el módulo cierra su conexión propia al destruirse', () => {
    const disconnect = jest.fn();
    new InventarioModule({ disconnect } as unknown as Redis).onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
