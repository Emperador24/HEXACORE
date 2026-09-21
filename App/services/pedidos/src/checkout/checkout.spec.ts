import { ConflictException, Logger, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CheckoutService, CHECKOUT_DURACION_SEGUNDOS } from './checkout.service';
import { ReservasService } from '../inventario/reservas.service';
import { EstadoReservaInventario, ReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';
import { CrearCheckoutDto } from './dto/crear-checkout.dto';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Establecimiento, EstadoEstablecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';

const eventoId = 'e0000001-0000-4000-8000-000000000001';
const establecimientoId = '30000000-0000-4000-8000-000000000001';
const productoId = '40000000-0000-4000-8000-000000000001';
const clienteId = 'a0000001-0000-4000-8000-000000000001';
const entrada = () => ({ eventoId, establecimientoId, metodoEntrega: 'Mostrador', productos: [{ productoId, cantidad: 3 }] });

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validar = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CrearCheckoutDto });

describe('CrearCheckoutDto', () => {
  it('valida y normaliza el método y UUID', async () => {
    const datos = await validar({ ...entrada(), eventoId: eventoId.toUpperCase(), metodoEntrega: '  Mostrador  ' });
    expect(datos).toMatchObject({ eventoId, metodoEntrega: 'Mostrador' });
  });
  it.each(['clienteId', 'precio', 'total', 'moneda', 'estado', 'expiraEn', 'codigoQr'])('rechaza %s enviado por el cliente', async (campo) => {
    await expect(validar({ ...entrada(), [campo]: 'valor' })).rejects.toThrow();
  });
  it.each([0, -1, 1.5, '2', 2147483648, null])('rechaza cantidad inválida %s', async (cantidad) => {
    await expect(validar({ ...entrada(), productos: [{ productoId, cantidad }] })).rejects.toThrow();
  });
  it.each([
    { productos: [] }, { productos: [null] }, { eventoId: 'no-uuid' }, { metodoEntrega: ' ' },
    { productos: [{ productoId, cantidad: 1, precio: '0.01' }] },
  ])('rechaza entrada malformada %j', async (cambios) => {
    await expect(validar({ ...entrada(), ...cambios })).rejects.toThrow();
  });
});

describe('CheckoutService', () => {
  let evento: Partial<EventoReferencia> | null;
  let establecimiento: Partial<Establecimiento> | null;
  let productos: Partial<Producto>[];
  let gestor: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock; insert: jest.Mock; update: jest.Mock };
  let crearTransaccion: jest.Mock;
  let transaccion: { manager: unknown; isTransactionActive: boolean; connect: jest.Mock; startTransaction: jest.Mock;
    commitTransaction: jest.Mock; rollbackTransaction: jest.Mock; release: jest.Mock };
  let reservas: { reservar: jest.Mock; liberar: jest.Mock };
  let pendientes: unknown[];
  let persistidas: unknown[];
  let service: CheckoutService;
  beforeEach(() => {
    evento = { eventoId, disponible: true };
    establecimiento = { id: establecimientoId, eventoId, estado: EstadoEstablecimiento.DISPONIBLE };
    productos = [{ id: productoId, establecimientoId, nombre: 'Producto original', precio: '0.10', activo: true, cantidadInventario: 20 }];
    pendientes = [];
    persistidas = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    gestor = {
      findOne: jest.fn(async (tipo) => tipo === EventoReferencia ? evento : establecimiento),
      find: jest.fn(async () => productos),
      create: jest.fn((_tipo, datos) => datos),
      save: jest.fn(async (_tipo, datos) => {
        const fila = { ...datos, id: '50000000-0000-4000-8000-000000000001' };
        pendientes.push(fila);
        return fila;
      }),
      insert: jest.fn(async (_tipo, datos) => { pendientes.push(datos); return {}; }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    transaccion = {
      manager: gestor, isTransactionActive: false, connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn(async () => { transaccion.isTransactionActive = true; }),
      commitTransaction: jest.fn(async () => { persistidas = [...pendientes]; pendientes = []; transaccion.isTransactionActive = false; }),
      rollbackTransaction: jest.fn(async () => { pendientes = []; transaccion.isTransactionActive = false; }),
      release: jest.fn().mockResolvedValue(undefined),
    };
    crearTransaccion = jest.fn(() => transaccion);
    reservas = {
      reservar: jest.fn(async (datos) => ({ estado: 'ACTIVA', expiraEn: datos.expiraEn, repetida: false })),
      liberar: jest.fn().mockResolvedValue({ estado: 'LIBERADA', repetida: false }),
    };
    service = new CheckoutService({ createQueryRunner: crearTransaccion } as unknown as DataSource, reservas as unknown as ReservasService);
  });
  afterEach(() => jest.restoreAllMocks());
  it('calcula centavos exactos, guarda snapshots y reserva sin descontar stock físico', async () => {
    const respuesta = await service.crear(clienteId, entrada());
    expect(transaccion.commitTransaction).toHaveBeenCalledTimes(1);
    expect(respuesta).toMatchObject({ total: '0.30', moneda: 'COP', estado: EstadoPedido.PENDIENTE_PAGO, codigoQr: null, inventarioReservado: true });
    expect(new Date(respuesta.expiraEn).getTime() - new Date(respuesta.creadoEn).getTime()).toBe(CHECKOUT_DURACION_SEGUNDOS * 1000);
    expect(gestor.save).toHaveBeenCalledWith(Pedido, expect.objectContaining({ clienteId, total: '0.30', confirmadoEn: null }));
    expect(gestor.insert).toHaveBeenCalledWith(DetallePedido, [expect.objectContaining({ pedidoId: respuesta.id, nombreProducto: 'Producto original', precioUnitario: '0.10', cantidad: 3 })]);
    productos[0].nombre = 'Nombre nuevo';
    productos[0].precio = '999.00';
    expect(respuesta.detalles[0]).toMatchObject({ nombreProducto: 'Producto original', precioUnitario: '0.10' });
    expect(gestor.save).toHaveBeenCalledTimes(1);
    expect(gestor.insert).toHaveBeenCalledTimes(2);
    expect(productos[0].cantidadInventario).toBe(20);
    const pedidoGuardado = gestor.save.mock.calls[0][1];
    expect(reservas.reservar).toHaveBeenCalledWith({ pedidoId: respuesta.id, establecimientoId,
      expiraEn: pedidoGuardado.expiraEn, productos: [{ productoId, cantidad: 3 }] });
    expect(reservas.reservar.mock.calls[0][0].expiraEn).toBe(pedidoGuardado.expiraEn);
    expect(respuesta.expiraEn).toBe(pedidoGuardado.expiraEn.toISOString());
    expect(gestor.insert).toHaveBeenCalledWith(ReservaInventario, { pedidoId: respuesta.id, estado: EstadoReservaInventario.PREPARANDO });
    expect(gestor.update).toHaveBeenCalledWith(ReservaInventario, { pedidoId: respuesta.id }, { estado: EstadoReservaInventario.ACTIVA });
    expect(gestor.insert.mock.invocationCallOrder[1]).toBeLessThan(reservas.reservar.mock.invocationCallOrder[0]);
    expect(reservas.reservar.mock.invocationCallOrder[0]).toBeLessThan(gestor.update.mock.invocationCallOrder[0]);
    expect(gestor.update.mock.invocationCallOrder[0]).toBeLessThan(transaccion.commitTransaction.mock.invocationCallOrder[0]);
    expect(persistidas).toHaveLength(3);
    expect(transaccion.rollbackTransaction).not.toHaveBeenCalled();
    expect(transaccion.release).toHaveBeenCalledTimes(1);
    expect(reservas.liberar).not.toHaveBeenCalled();
  });
  it.each(['evento inexistente', 'evento no disponible', 'establecimiento inexistente', 'otro evento', 'cerrado', 'saturado', 'deshabilitado', 'producto inexistente', 'otro establecimiento', 'inactivo', 'agotado', 'insuficiente', 'desbordamiento'])('rechaza %s sin insertar filas', async (caso) => {
    switch (caso) {
      case 'evento inexistente': evento = null; break;
      case 'evento no disponible': evento!.disponible = false; break;
      case 'establecimiento inexistente': establecimiento = null; break;
      case 'otro evento': establecimiento!.eventoId = 'otro'; break;
      case 'cerrado': establecimiento!.estado = EstadoEstablecimiento.CERRADO; break;
      case 'saturado': establecimiento!.estado = EstadoEstablecimiento.SATURADO; break;
      case 'deshabilitado': establecimiento!.estado = EstadoEstablecimiento.DESHABILITADO; break;
      case 'producto inexistente': productos = []; break;
      case 'otro establecimiento': productos[0].establecimientoId = 'otro'; break;
      case 'inactivo': productos[0].activo = false; break;
      case 'agotado': productos[0].cantidadInventario = 0; break;
      case 'insuficiente': productos[0].cantidadInventario = 1; break;
      case 'desbordamiento': productos[0].precio = '9999999999.99'; break;
    }
    await expect(service.crear(clienteId, entrada())).rejects.toThrow();
    expect(gestor.save).not.toHaveBeenCalled();
    expect(gestor.insert).not.toHaveBeenCalled();
    expect(reservas.reservar).not.toHaveBeenCalled();
    expect(transaccion.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(transaccion.release).toHaveBeenCalledTimes(1);
  });
  it('informa la cantidad disponible ante inventario insuficiente', async () => {
    productos[0].cantidadInventario = 1;
    await expect(service.crear(clienteId, entrada())).rejects.toMatchObject({ response: { codigo: 'INVENTARIO_INSUFICIENTE', cantidadDisponible: 1, cantidadSolicitada: 3 } });
  });
  it('rechaza productos duplicados antes de abrir la transacción', async () => {
    const datos = entrada();
    datos.productos.push({ productoId, cantidad: 1 });
    await expect(service.crear(clienteId, datos)).rejects.toThrow();
    expect(crearTransaccion).not.toHaveBeenCalled();
  });
  it('hace rollback si falla guardar detalles, sin intentar Redis', async () => {
    gestor.insert.mockRejectedValue(new Error('falló detalle'));
    await expect(service.crear(clienteId, entrada())).rejects.toThrow('falló detalle');
    expect(transaccion.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(pendientes).toEqual([]);
    expect(persistidas).toEqual([]);
    expect(reservas.reservar).not.toHaveBeenCalled();
  });
  it.each([
    new ConflictException({ codigo: 'INVENTARIO_INSUFICIENTE' }),
    new ServiceUnavailableException({ codigo: 'INVENTARIO_NO_PREPARADO' }),
  ])('mantiene el error HTTP de Redis y revierte pedido, detalles y reserva técnica', async (error) => {
    reservas.reservar.mockRejectedValue(error);
    await expect(service.crear(clienteId, entrada())).rejects.toBe(error);
    expect(gestor.insert).toHaveBeenCalledTimes(2);
    expect(transaccion.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(pendientes).toEqual([]);
    expect(persistidas).toEqual([]);
    expect(gestor.update).not.toHaveBeenCalled();
    expect(transaccion.commitTransaction).not.toHaveBeenCalled();
    expect(reservas.liberar).not.toHaveBeenCalled();
    expect(transaccion.release).toHaveBeenCalledTimes(1);
  });
  it('libera idempotentemente la reserva activa solo después del rollback confirmado', async () => {
    const error = new Error('falló actualizar reserva');
    gestor.update.mockRejectedValue(error);
    reservas.liberar.mockImplementation(async () => {
      expect(transaccion.isTransactionActive).toBe(false);
      expect(pendientes).toEqual([]);
      return { estado: 'LIBERADA' };
    });
    await expect(service.crear(clienteId, entrada())).rejects.toBe(error);
    expect(reservas.liberar).toHaveBeenCalledWith(establecimientoId, '50000000-0000-4000-8000-000000000001');
    expect(transaccion.rollbackTransaction.mock.invocationCallOrder[0]).toBeLessThan(reservas.liberar.mock.invocationCallOrder[0]);
    expect(persistidas).toEqual([]);
    expect(transaccion.commitTransaction).not.toHaveBeenCalled();
    expect(transaccion.release).toHaveBeenCalledTimes(1);
  });
  it('si no se actualiza la fila técnica, revierte y compensa la reserva', async () => {
    gestor.update.mockResolvedValue({ affected: 0 });
    await expect(service.crear(clienteId, entrada())).rejects.toMatchObject({ response: { codigo: 'RESERVA_PERSISTENCIA_INCONSISTENTE' } });
    expect(reservas.liberar).toHaveBeenCalledTimes(1);
    expect(transaccion.commitTransaction).not.toHaveBeenCalled();
  });
  it('si la compensación falla conserva el error original y registra identificadores', async () => {
    const error = new Error('falló actualizar reserva');
    gestor.update.mockRejectedValue(error);
    reservas.liberar.mockRejectedValue(new Error('Redis no disponible'));
    await expect(service.crear(clienteId, entrada())).rejects.toBe(error);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('CHECKOUT_LIBERACION_PENDIENTE pedido=50000000-0000-4000-8000-000000000001'));
    expect(transaccion.release).toHaveBeenCalledTimes(1);
  });
  it('no libera si el rollback no pudo confirmarse', async () => {
    gestor.update.mockRejectedValue(new Error('falló actualizar reserva'));
    transaccion.rollbackTransaction.mockRejectedValue(new Error('conexión perdida'));
    await expect(service.crear(clienteId, entrada())).rejects.toThrow('falló actualizar reserva');
    expect(reservas.liberar).not.toHaveBeenCalled();
    expect(transaccion.release).toHaveBeenCalledTimes(1);
  });
  it('no libera tras un commit incierto aunque luego ROLLBACK responda', async () => {
    transaccion.commitTransaction.mockRejectedValue(new Error('respuesta de COMMIT perdida'));
    await expect(service.crear(clienteId, entrada())).rejects.toThrow('respuesta de COMMIT perdida');
    expect(transaccion.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(reservas.liberar).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('commitIntentado=true'));
  });
  it('un timeout de reserva no se confunde con ausencia de reserva', async () => {
    reservas.reservar.mockRejectedValue(new ServiceUnavailableException({ codigo: 'RESERVA_RESULTADO_INCIERTO' }));
    await expect(service.crear(clienteId, entrada())).rejects.toMatchObject({ status: 503 });
    expect(transaccion.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(reservas.liberar).not.toHaveBeenCalled();
    expect(persistidas).toEqual([]);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('CHECKOUT_REVISAR_RESERVA'));
  });
  it.each(['LIBERADA', 'CONSUMIDA'])('no acepta como éxito una reserva %s', async (estado) => {
    reservas.reservar.mockImplementation(async (datos) => ({ estado, expiraEn: datos.expiraEn, repetida: true }));
    await expect(service.crear(clienteId, entrada())).rejects.toMatchObject({ response: { codigo: 'RESERVA_CHECKOUT_INCONSISTENTE' } });
    expect(transaccion.commitTransaction).not.toHaveBeenCalled();
    expect(reservas.liberar).not.toHaveBeenCalled();
  });
  it('rechaza un vencimiento diferente sin renovar los 600 segundos', async () => {
    reservas.reservar.mockImplementation(async (datos) => ({ estado: 'ACTIVA', expiraEn: new Date(datos.expiraEn.getTime() + 1000), repetida: true }));
    await expect(service.crear(clienteId, entrada())).rejects.toMatchObject({ response: { codigo: 'RESERVA_CHECKOUT_INCONSISTENTE' } });
    expect(transaccion.commitTransaction).not.toHaveBeenCalled();
    expect(reservas.liberar).toHaveBeenCalledTimes(1);
  });
  it('un fallo al devolver la conexión no convierte un commit exitoso en un checkout fallido', async () => {
    transaccion.release.mockRejectedValue(new Error('falló release'));
    await expect(service.crear(clienteId, entrada())).resolves.toMatchObject({ inventarioReservado: true });
    expect(reservas.liberar).not.toHaveBeenCalled();
    expect(transaccion.rollbackTransaction).not.toHaveBeenCalled();
  });
  it('libera recursos si falla conectar antes de empezar la transacción', async () => {
    transaccion.connect.mockRejectedValue(new Error('no conecta'));
    await expect(service.crear(clienteId, entrada())).rejects.toThrow('no conecta');
    expect(transaccion.release).toHaveBeenCalledTimes(1);
    expect(reservas.reservar).not.toHaveBeenCalled();
    expect(transaccion.rollbackTransaction).not.toHaveBeenCalled();
  });

});

// Comprueba que el endpoint exige el guard y el rol, además de validar el body.
import { CheckoutController } from './checkout.controller';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { GUARDS_METADATA, PIPES_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext } from '@nestjs/common';

describe('CheckoutController', () => {
  it('exige SesionValida y rol Cliente', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CheckoutController)).toContain(SesionValida);
    expect(Reflect.getMetadata('roles-permitidos', CheckoutController)).toEqual(['Cliente']);
  });
  it('rechaza clienteId mediante el pipe realmente aplicado a la ruta', async () => {
    const [validacion] = Reflect.getMetadata(PIPES_METADATA, CheckoutController.prototype.crear) as ValidationPipe[];
    await expect(validacion.transform({ ...entrada(), clienteId }, { type: 'body', metatype: CrearCheckoutDto })).rejects.toThrow();
  });
  it('extrae el usuario de la sesión verificada e ignora la cabecera', async () => {
    const argumentos = Reflect.getMetadata(ROUTE_ARGS_METADATA, CheckoutController, 'crear') as Record<string, { index: number; factory?: (data: unknown, ctx: ExecutionContext) => string }>;
    const usuario = Object.values(argumentos).find((valor) => valor.index === 0)!;
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ sesion: { usuarioId: clienteId }, headers: { 'x-usuario-id': 'impostor' } }) }) } as unknown as ExecutionContext;
    const crear = jest.fn().mockResolvedValue({ estado: EstadoPedido.PENDIENTE_PAGO });
    const controller = new CheckoutController({ crear } as unknown as CheckoutService);
    await controller.crear(usuario.factory!(undefined, ctx), entrada());
    expect(crear).toHaveBeenCalledWith(clienteId, entrada());
  });
});
