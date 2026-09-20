import { ValidationPipe } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CheckoutService, CHECKOUT_DURACION_SEGUNDOS } from './checkout.service';
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
  let gestor: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock; insert: jest.Mock };
  let transaction: jest.Mock;
  let service: CheckoutService;
  beforeEach(() => {
    evento = { eventoId, disponible: true };
    establecimiento = { id: establecimientoId, eventoId, estado: EstadoEstablecimiento.DISPONIBLE };
    productos = [{ id: productoId, establecimientoId, nombre: 'Producto original', precio: '0.10', activo: true, cantidadInventario: 20 }];
    gestor = {
      findOne: jest.fn(async (tipo) => tipo === EventoReferencia ? evento : establecimiento),
      find: jest.fn(async () => productos),
      create: jest.fn((_tipo, datos) => datos),
      save: jest.fn(async (_tipo, datos) => ({ ...datos, id: '50000000-0000-4000-8000-000000000001' })),
      insert: jest.fn().mockResolvedValue({}),
    };
    transaction = jest.fn(async (trabajo: (tx: EntityManager) => unknown) => trabajo(gestor as unknown as EntityManager));
    service = new CheckoutService({ transaction } as unknown as DataSource);
  });
  it('calcula centavos exactos, guarda snapshots y solo escribe pedido y detalles', async () => {
    const respuesta = await service.crear(clienteId, entrada());
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(respuesta).toMatchObject({ total: '0.30', moneda: 'COP', estado: EstadoPedido.PENDIENTE_PAGO, codigoQr: null, inventarioReservado: false });
    expect(new Date(respuesta.expiraEn).getTime() - new Date(respuesta.creadoEn).getTime()).toBe(CHECKOUT_DURACION_SEGUNDOS * 1000);
    expect(gestor.save).toHaveBeenCalledWith(Pedido, expect.objectContaining({ clienteId, total: '0.30', confirmadoEn: null }));
    expect(gestor.insert).toHaveBeenCalledWith(DetallePedido, [expect.objectContaining({ pedidoId: respuesta.id, nombreProducto: 'Producto original', precioUnitario: '0.10', cantidad: 3 })]);
    productos[0].nombre = 'Nombre nuevo';
    productos[0].precio = '999.00';
    expect(respuesta.detalles[0]).toMatchObject({ nombreProducto: 'Producto original', precioUnitario: '0.10' });
    expect(gestor.save).toHaveBeenCalledTimes(1);
    expect(gestor.insert).toHaveBeenCalledTimes(1);
    expect(productos[0].cantidadInventario).toBe(20);
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
  });
  it('informa la cantidad disponible ante inventario insuficiente', async () => {
    productos[0].cantidadInventario = 1;
    await expect(service.crear(clienteId, entrada())).rejects.toMatchObject({ response: { codigo: 'INVENTARIO_INSUFICIENTE', cantidadDisponible: 1, cantidadSolicitada: 3 } });
  });
  it('rechaza productos duplicados antes de abrir la transacción', async () => {
    const datos = entrada();
    datos.productos.push({ productoId, cantidad: 1 });
    await expect(service.crear(clienteId, datos)).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('propaga el fallo de detalles fuera de la transacción para que TypeORM haga rollback', async () => {
    gestor.insert.mockRejectedValue(new Error('falló detalle'));
    await expect(service.crear(clienteId, entrada())).rejects.toThrow('falló detalle');
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
