import crypto from 'node:crypto';
import { ExecutionContext, HttpException, Logger, ValidationPipe } from '@nestjs/common';
import { DataSource, EntityManager, MoreThanOrEqual } from 'typeorm';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { TransaccionPedido, EstadoTransaccionPedido as Estado } from '../persistencia/entidades/transaccion-pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { ReservaInventario, EstadoReservaInventario as EstadoReserva } from '../persistencia/entidades/reserva-inventario.entity';
import { ReservasService } from '../inventario/reservas.service';
import { CrearPagoDto } from './dto/crear-pago.dto';
import { PagosService } from './pagos.service';
import { PasarelaHttp } from './pasarela-http.service';
import { PagosController } from './pagos.controller';
import { PagoDto } from './dto/pago.dto';
import { GUARDS_METADATA, HTTP_CODE_METADATA, PIPES_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';

const id = '50000000-0000-4000-8000-000000000001';
const clave = '60000000-0000-4000-8000-000000000001';
const otraClave = '60000000-0000-4000-8000-000000000002';
const cliente = 'a0000001-0000-4000-8000-000000000001';
const establecimientoId = '30000000-0000-4000-8000-000000000001';
const productoId = '40000000-0000-4000-8000-000000000001';
const productoDosId = '40000000-0000-4000-8000-000000000002';
const aprobado = { estado: Estado.APROBADA, referenciaPasarela: 'pas_70000000-0000-4000-8000-000000000001', motivo: null };

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, validationError: { target: false, value: false } });
describe('CrearPagoDto', () => {
  it('acepta solo un token opaco', async () => {
    await expect(pipe.transform({ tokenPago: 'tok_ok' }, { type: 'body', metatype: CrearPagoDto })).resolves.toEqual({ tokenPago: 'tok_ok' });
  });
  it.each(['monto', 'moneda', 'clienteId', 'estado', 'pan', 'cvv', 'vencimiento', 'total'])('rechaza %s', async (campo) => {
    await expect(pipe.transform({ tokenPago: 'tok_ok', [campo]: 'secreto' }, { type: 'body', metatype: CrearPagoDto })).rejects.toThrow();
  });
  it.each(['', ' ', null, 123, 'x'.repeat(2049)])('rechaza token inválido', async (tokenPago) => {
    await expect(pipe.transform({ tokenPago }, { type: 'body', metatype: CrearPagoDto })).rejects.toThrow();
  });
});

describe('PagosService (gestor transaccional simulado)', () => {
  let pedido: Pedido;
  let intentos: TransaccionPedido[];
  let cobrar: jest.Mock;
  let servicio: PagosService;
  let reserva: ReservaInventario | null;
  let detalles: DetallePedido[];
  let productos: Producto[];
  let consumir: jest.Mock;
  let actualizarConsumo: jest.Mock;
  let fallarCommitConfirmacion: boolean;
  let gestor: { findOne: jest.Mock; findOneOrFail: jest.Mock; find: jest.Mock; create: jest.Mock; insert: jest.Mock; save: jest.Mock; decrement: jest.Mock };
  let dentro: boolean;
  beforeEach(() => {
    pedido = Object.assign(new Pedido(), { id, establecimientoId, clienteId: cliente, total: '25000.00', moneda: 'COP', estado: EstadoPedido.PENDIENTE_PAGO, expiraEn: new Date(Date.now() + 600000), codigoQr: null, confirmadoEn: null });
    intentos = [];
    reserva = Object.assign(new ReservaInventario(), { pedidoId: id, estado: EstadoReserva.ACTIVA });
    detalles = [{ pedidoId: id, productoId, cantidad: 2 }] as DetallePedido[];
    productos = [{ id: productoId, establecimientoId, cantidadInventario: 5 }] as Producto[];
    fallarCommitConfirmacion = false;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    dentro = false;
    gestor = {
      findOne: jest.fn(async (tipo, opciones) => tipo === Pedido
        ? opciones.where.clienteId && opciones.where.clienteId !== cliente ? null : pedido
        : tipo === ReservaInventario ? reserva : intentos.find((t) => t.id === opciones.where.id) ?? null),
      findOneOrFail: jest.fn(async (tipo, opciones) => {
        const fila = await gestor.findOne(tipo, opciones);
        if (!fila) throw new Error('Registro no encontrado');
        return fila;
      }),
      find: jest.fn(async (tipo) => tipo === DetallePedido ? detalles : tipo === Producto ? productos : intentos),
      create: jest.fn((_tipo, datos) => ({ ...datos })),
      insert: jest.fn(async (_tipo, datos) => { intentos.push(datos); }),
      save: jest.fn(async (_tipo, datos) => datos),
      decrement: jest.fn(async (_tipo, criterio, _campo, cantidad) => {
        const producto = productos.find((p) => p.id === criterio.id && p.establecimientoId === criterio.establecimientoId);
        expect(criterio.cantidadInventario).toEqual(MoreThanOrEqual(cantidad));
        if (!producto || producto.cantidadInventario < cantidad) return { affected: 0 };
        producto.cantidadInventario -= cantidad;
        return { affected: 1 };
      }),
    };
    // Serializa callbacks como el bloqueo de Pedido; no sustituye una prueba real de PostgreSQL.
    let cola = Promise.resolve();
    const transaction = <T>(trabajo: (tx: EntityManager) => Promise<T>): Promise<T> => {
      const resultado = cola.then(async () => {
        dentro = true;
        const previo = structuredClone({ pedido, reserva, detalles, productos, intentos });
        try {
          const valor = await trabajo(gestor as unknown as EntityManager);
          if (fallarCommitConfirmacion && previo.pedido.estado !== EstadoPedido.CONFIRMADO && pedido.estado === EstadoPedido.CONFIRMADO) {
            throw new Error('falló commit de confirmación');
          }
          return valor;
        } catch (error) {
          ({ pedido, reserva, detalles, productos, intentos } = previo);
          throw error;
        } finally { dentro = false; }
      });
      cola = resultado.then(() => undefined, () => undefined);
      return resultado;
    };
    cobrar = jest.fn(async () => { expect(dentro).toBe(false); return aprobado; });
    consumir = jest.fn(async () => {
      expect(dentro).toBe(false);
      expect(pedido.estado).toBe(EstadoPedido.CONFIRMADO);
      expect(reserva?.estado).toBe(EstadoReserva.CONSUMO_PENDIENTE);
      return { estado: 'CONSUMIDA' };
    });
    actualizarConsumo = jest.fn(async (_tipo, criterio, cambios) => {
      if (!reserva || reserva.estado !== criterio.estado) return { affected: 0 };
      Object.assign(reserva, cambios);
      return { affected: 1 };
    });
    servicio = new PagosService({ transaction, manager: { update: actualizarConsumo } } as unknown as DataSource,
      { cobrar } as unknown as PasarelaHttp, { consumir } as unknown as ReservasService);
  });
  afterEach(() => jest.restoreAllMocks());
  const errorCodigo = async (promesa: Promise<unknown>, codigo: string) => {
    await expect(promesa).rejects.toMatchObject({ response: { codigo } });
  };
  it('cobra el total guardado, confirma el pedido y consume el inventario reservado', async () => {
    const resultado = await servicio.pagar(cliente, id, clave, 'tok_secreto');
    expect(cobrar).toHaveBeenCalledWith(clave, '25000.00', 'COP', 'tok_secreto');
    expect(resultado).toMatchObject({ estadoPago: Estado.APROBADA, estadoPedido: EstadoPedido.CONFIRMADO, compraConfirmada: true });
    expect(pedido).toMatchObject({ codigoQr: expect.stringMatching(/^[0-9a-f]{64}$/), confirmadoEn: expect.any(Date) });
    expect(productos[0].cantidadInventario).toBe(3);
    expect(reserva?.estado).toBe(EstadoReserva.CONSUMIDA);
    expect(consumir).toHaveBeenCalledWith(establecimientoId, id);
    expect(actualizarConsumo).toHaveBeenCalledWith(ReservaInventario,
      { pedidoId: id, estado: EstadoReserva.CONSUMO_PENDIENTE }, { estado: EstadoReserva.CONSUMIDA });
    expect(gestor.find).toHaveBeenCalledWith(Producto, expect.objectContaining({ order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } }));
    expect(gestor.findOne).toHaveBeenCalledWith(Pedido, { where: { id, clienteId: cliente }, lock: { mode: 'pessimistic_write' } });
    expect(gestor.save).toHaveBeenCalledWith(TransaccionPedido, expect.objectContaining({ estado: Estado.APROBADA }));
    expect(JSON.stringify(intentos)).not.toContain('tok_secreto');
  });
  it('genera QR con 32 bytes criptográficos y lo persiste dentro de la confirmación', async () => {
    const aleatorio = jest.spyOn(crypto, 'randomBytes');
    let qrGuardado: string | null = null;
    gestor.save.mockImplementation(async (tipo, fila) => {
      if (tipo === Pedido && fila.estado === EstadoPedido.CONFIRMADO) {
        expect(dentro).toBe(true);
        expect(fila.codigoQr).toMatch(/^[0-9a-f]{64}$/);
        qrGuardado = fila.codigoQr;
      }
      return fila;
    });
    const respuesta = await servicio.pagar(cliente, id, clave, 'tok_ok');
    expect(aleatorio).toHaveBeenCalledTimes(1);
    expect(aleatorio).toHaveBeenCalledWith(32);
    expect(respuesta.codigoQr).toBe(qrGuardado);
    expect(respuesta.codigoQr).toBe(pedido.codigoQr);
    expect(respuesta.codigoQr).not.toBeNull();
  });
  it('replays de aprobación conservan exactamente el QR sin generar ni guardar otro', async () => {
    const aleatorio = jest.spyOn(crypto, 'randomBytes');
    const primera = await servicio.pagar(cliente, id, clave, 'tok_ok');
    const guardados = gestor.save.mock.calls.length;
    const [segunda, tercera] = await Promise.all([
      servicio.pagar(cliente, id, clave, 'tok_ok'), servicio.pagar(cliente, id, clave, 'tok_ok'),
    ]);
    expect(segunda.codigoQr).toBe(primera.codigoQr);
    expect(tercera.codigoQr).toBe(primera.codigoQr);
    expect(aleatorio).toHaveBeenCalledTimes(1);
    expect(gestor.save).toHaveBeenCalledTimes(guardados);
  });
  it('rollback de la confirmación no persiste un QR ni confirma el pedido', async () => {
    const aleatorio = jest.spyOn(crypto, 'randomBytes');
    fallarCommitConfirmacion = true;
    await expect(servicio.pagar(cliente, id, clave, 'tok_ok')).rejects.toThrow('falló commit de confirmación');
    expect(aleatorio).toHaveBeenCalledTimes(1);
    expect(pedido.codigoQr).toBeNull();
    expect(pedido.estado).toBe(EstadoPedido.PENDIENTE_PAGO);
  });
  it('pago rechazado no genera QR y responde codigoQr null', async () => {
    const aleatorio = jest.spyOn(crypto, 'randomBytes');
    cobrar.mockResolvedValue({ estado: Estado.RECHAZADA, referenciaPasarela: aprobado.referenciaPasarela, motivo: 'PAGO_RECHAZADO' });
    expect((await servicio.pagar(cliente, id, clave, 'tok_rechazo')).codigoQr).toBeNull();
    expect(pedido.codigoQr).toBeNull();
    expect(aleatorio).not.toHaveBeenCalled();
  });
  it('el QR persiste aunque falle cerrar Redis y el replay conserva el mismo valor', async () => {
    const aleatorio = jest.spyOn(crypto, 'randomBytes');
    consumir.mockRejectedValueOnce(new Error('Redis no disponible'));
    const primera = await servicio.pagar(cliente, id, clave, 'tok_ok');
    expect(primera.codigoQr).toMatch(/^[0-9a-f]{64}$/);
    expect(primera.codigoQr).toBe(pedido.codigoQr);
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).codigoQr).toBe(primera.codigoQr);
    expect(aleatorio).toHaveBeenCalledTimes(1);
  });
  it('repite aprobación aun vencido sin cobrar y bloquea otra clave', async () => {
    const primero = await servicio.pagar(cliente, id, clave, 'tok_ok');
    pedido.expiraEn = new Date(0);
    expect(await servicio.pagar(cliente, id, clave, 'tok_otro')).toEqual(primero);
    await errorCodigo(servicio.pagar(cliente, id, otraClave, 'tok_otro'), 'PEDIDO_YA_PAGADO');
    expect(cobrar).toHaveBeenCalledTimes(1);
    expect(gestor.decrement).toHaveBeenCalledTimes(1);
    expect(productos[0].cantidadInventario).toBe(3);
    expect(consumir).toHaveBeenCalledTimes(1);
  });
  it('conserva rechazo y permite un nuevo intento mientras esté vigente', async () => {
    cobrar.mockResolvedValueOnce({ estado: Estado.RECHAZADA, referenciaPasarela: aprobado.referenciaPasarela, motivo: 'PAGO_RECHAZADO' });
    await servicio.pagar(cliente, id, clave, 'tok_rechazo');
    expect(gestor.decrement).not.toHaveBeenCalled();
    expect(consumir).not.toHaveBeenCalled();
    expect(reserva?.estado).toBe(EstadoReserva.ACTIVA);
    expect(productos[0].cantidadInventario).toBe(5);
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).estadoPago).toBe(Estado.RECHAZADA);
    await servicio.pagar(cliente, id, otraClave, 'tok_ok');
    expect(intentos.map((t) => t.estado)).toEqual([Estado.RECHAZADA, Estado.APROBADA]);
    expect(cobrar).toHaveBeenCalledTimes(2);
  });
  it.each(['PASARELA_TIMEOUT', 'PASARELA_ERROR_TECNICO'])('conserva %s y bloquea nuevos cobros incluso al expirar', async (motivo) => {
    cobrar.mockResolvedValue({ estado: Estado.FALLIDA, referenciaPasarela: null, motivo });
    await servicio.pagar(cliente, id, clave, 'tok_ok');
    pedido.expiraEn = new Date(0);
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).estadoPago).toBe(Estado.FALLIDA);
    await errorCodigo(servicio.pagar(cliente, id, otraClave, 'tok_ok'), 'PAGO_PENDIENTE_RESOLUCION');
    expect(cobrar).toHaveBeenCalledTimes(1);
    expect(pedido.estado).toBe(EstadoPedido.PENDIENTE_PAGO);
  });
  it('persiste expiración antes de responder el conflicto y no cobra', async () => {
    pedido.expiraEn = new Date(0);
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'CHECKOUT_EXPIRADO');
    expect(pedido.estado).toBe(EstadoPedido.EXPIRADO);
    expect(gestor.save).toHaveBeenCalledWith(Pedido, pedido);
    expect(cobrar).not.toHaveBeenCalled();
    expect(intentos).toHaveLength(0);
  });
  it.each([EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO, EstadoPedido.EXPIRADO])('no cobra pedido %s', async (estado) => {
    pedido.estado = estado;
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'ESTADO_PEDIDO_NO_PERMITE_PAGO');
    expect(cobrar).not.toHaveBeenCalled();
  });
  it('oculta pedido ajeno antes de consultar intentos', async () => {
    await errorCodigo(servicio.pagar('otro-cliente', id, clave, 'tok_ok'), 'PEDIDO_NO_ENCONTRADO');
    expect(gestor.findOne).toHaveBeenCalledTimes(1);
    expect(cobrar).not.toHaveBeenCalled();
  });
  it('rechaza una clave de otro pedido', async () => {
    intentos.push({ id: clave, pedidoId: 'otro-pedido' } as TransaccionPedido);
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE');
    expect(cobrar).not.toHaveBeenCalled();
  });
  it('la colisión simultánea de PK no dispara el cobro', async () => {
    gestor.insert.mockRejectedValue({ driverError: { code: '23505' } });
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE');
    expect(cobrar).not.toHaveBeenCalled();
  });
  it('coordina llamadas concurrentes durante el HTTP y conserva aprobación tardía', async () => {
    let terminar!: (valor: typeof aprobado) => void;
    let avisar!: () => void;
    const iniciada = new Promise<void>((resolve) => { avisar = resolve; });
    cobrar.mockImplementation(() => { expect(dentro).toBe(false); avisar(); return new Promise((resolve) => { terminar = resolve; }); });
    const primera = servicio.pagar(cliente, id, clave, 'tok_ok');
    await iniciada;
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).estadoPago).toBe(Estado.PENDIENTE);
    await errorCodigo(servicio.pagar(cliente, id, otraClave, 'tok_ok'), 'PAGO_PENDIENTE_RESOLUCION');
    pedido.expiraEn = new Date(0);
    terminar(aprobado);
    expect((await primera).estadoPago).toBe(Estado.APROBADA);
    expect(pedido.estado).toBe(EstadoPedido.CONFIRMADO);
    expect(cobrar).toHaveBeenCalledTimes(1);
  });
  it('expira tras rechazo tardío', async () => {
    cobrar.mockImplementation(async () => { pedido.expiraEn = new Date(0); return { estado: Estado.RECHAZADA, referenciaPasarela: aprobado.referenciaPasarela, motivo: 'PAGO_RECHAZADO' }; });
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).estadoPedido).toBe(EstadoPedido.EXPIRADO);
  });
  it('una caída al guardar el resultado impide otro cobro', async () => {
    gestor.save.mockImplementation(async () => { intentos[0].estado = Estado.PENDIENTE; throw new Error('DB no disponible'); });
    await expect(servicio.pagar(cliente, id, clave, 'tok_ok')).rejects.toThrow('DB no disponible');
    await errorCodigo(servicio.pagar(cliente, id, otraClave, 'tok_ok'), 'PAGO_PENDIENTE_RESOLUCION');
    expect(cobrar).toHaveBeenCalledTimes(1);
  });
  it.each([null, EstadoReserva.PREPARANDO, EstadoReserva.LIBERACION_PENDIENTE, EstadoReserva.LIBERADA, EstadoReserva.CONSUMO_PENDIENTE, EstadoReserva.CONSUMIDA])('no cobra sin reserva ACTIVA (%s)', async (estado) => {
    if (estado === null) reserva = null;
    else reserva!.estado = estado;
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'RESERVA_NO_ACTIVA');
    expect(cobrar).not.toHaveBeenCalled();
    expect(intentos).toHaveLength(0);
    expect(gestor.decrement).not.toHaveBeenCalled();
    expect(consumir).not.toHaveBeenCalled();
  });
  it('descuenta varios productos dentro de la misma confirmación', async () => {
    detalles.push({ pedidoId: id, productoId: productoDosId, cantidad: 3 } as DetallePedido);
    productos.push({ id: productoDosId, establecimientoId, cantidadInventario: 3 } as Producto);
    await servicio.pagar(cliente, id, clave, 'tok_ok');
    expect(productos.map((p) => p.cantidadInventario)).toEqual([3, 0]);
    expect(gestor.decrement).toHaveBeenCalledTimes(2);
    expect(pedido.estado).toBe(EstadoPedido.CONFIRMADO);
  });
  it('stock insuficiente en el segundo producto revierte el primer descuento, sin inventario negativo', async () => {
    detalles.push({ pedidoId: id, productoId: productoDosId, cantidad: 3 } as DetallePedido);
    productos.push({ id: productoDosId, establecimientoId, cantidadInventario: 2 } as Producto);
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'INVENTARIO_INSUFICIENTE_CONFIRMACION');
    expect(gestor.decrement).toHaveBeenCalledTimes(2);
    expect(productos.map((p) => p.cantidadInventario)).toEqual([5, 2]);
    expect(pedido).toMatchObject({ estado: EstadoPedido.PENDIENTE_PAGO, confirmadoEn: null });
    expect(reserva?.estado).toBe(EstadoReserva.ACTIVA);
    expect(intentos[0].estado).toBe(Estado.APROBADA);
    expect(consumir).not.toHaveBeenCalled();
  });
  it('un fallo PostgreSQL al guardar la confirmación revierte stock y conserva aprobación y reserva', async () => {
    gestor.save.mockImplementation(async (tipo, datos) => {
      if (tipo === ReservaInventario) throw new Error('fallo SQL');
      return datos;
    });
    await expect(servicio.pagar(cliente, id, clave, 'tok_ok')).rejects.toThrow('fallo SQL');
    expect(productos[0].cantidadInventario).toBe(5);
    expect(pedido.estado).toBe(EstadoPedido.PENDIENTE_PAGO);
    expect(reserva?.estado).toBe(EstadoReserva.ACTIVA);
    expect(intentos[0].estado).toBe(Estado.APROBADA);
    expect(consumir).not.toHaveBeenCalled();
  });
  it('si falla el commit de confirmación no consume Redis; un replay puede completar sin recobrar', async () => {
    fallarCommitConfirmacion = true;
    await expect(servicio.pagar(cliente, id, clave, 'tok_ok')).rejects.toThrow('falló commit de confirmación');
    expect(consumir).not.toHaveBeenCalled();
    expect(intentos[0].estado).toBe(Estado.APROBADA);
    expect(productos[0].cantidadInventario).toBe(5);
    fallarCommitConfirmacion = false;
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).compraConfirmada).toBe(true);
    expect(cobrar).toHaveBeenCalledTimes(1);
    expect(productos[0].cantidadInventario).toBe(3);
  });
  it('fallo Redis deja CONSUMO_PENDIENTE y compra confirmada; replay solo reintenta el cierre', async () => {
    consumir.mockRejectedValueOnce(new Error('Redis no disponible'));
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).compraConfirmada).toBe(true);
    expect(reserva?.estado).toBe(EstadoReserva.CONSUMO_PENDIENTE);
    expect(pedido.estado).toBe(EstadoPedido.CONFIRMADO);
    expect(productos[0].cantidadInventario).toBe(3);
    expect(actualizarConsumo).not.toHaveBeenCalled();
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('CONSUMO_REDIS_PENDIENTE'));
    await servicio.pagar(cliente, id, clave, 'tok_ok');
    expect(reserva?.estado).toBe(EstadoReserva.CONSUMIDA);
    expect(gestor.decrement).toHaveBeenCalledTimes(1);
    expect(cobrar).toHaveBeenCalledTimes(1);
    expect(consumir).toHaveBeenCalledTimes(2);
  });
  it('fallo al guardar CONSUMIDA no desconfirma ni vuelve a sumar inventario', async () => {
    actualizarConsumo.mockRejectedValueOnce(new Error('DB no disponible'));
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).compraConfirmada).toBe(true);
    expect(reserva?.estado).toBe(EstadoReserva.CONSUMO_PENDIENTE);
    expect(productos[0].cantidadInventario).toBe(3);
    await servicio.pagar(cliente, id, clave, 'tok_ok');
    expect(reserva?.estado).toBe(EstadoReserva.CONSUMIDA);
    expect(gestor.decrement).toHaveBeenCalledTimes(1);
  });
  it('vuelve a validar la reserva después del cobro, preservando la aprobación si dejó de estar activa', async () => {
    cobrar.mockImplementation(async () => { reserva!.estado = EstadoReserva.LIBERADA; return aprobado; });
    await errorCodigo(servicio.pagar(cliente, id, clave, 'tok_ok'), 'PEDIDO_NO_CONFIRMABLE');
    expect(intentos[0].estado).toBe(Estado.APROBADA);
    expect(gestor.decrement).not.toHaveBeenCalled();
    expect(consumir).not.toHaveBeenCalled();
  });
  it.each(['sin detalles', 'producto ausente', 'otro establecimiento', 'pedido cancelado'])('rechaza confirmación inconsistente: %s', async (caso) => {
    cobrar.mockImplementation(async () => {
      if (caso === 'sin detalles') detalles = [];
      if (caso === 'producto ausente') productos = [];
      if (caso === 'otro establecimiento') productos[0].establecimientoId = 'otro';
      if (caso === 'pedido cancelado') pedido.estado = EstadoPedido.CANCELADO;
      return aprobado;
    });
    await expect(servicio.pagar(cliente, id, clave, 'tok_ok')).rejects.toMatchObject({ status: 409 });
    expect(intentos[0].estado).toBe(Estado.APROBADA);
    expect(gestor.decrement).not.toHaveBeenCalled();
    expect(consumir).not.toHaveBeenCalled();
  });
  it('un cierre Redis inesperado no marca la reserva como CONSUMIDA', async () => {
    consumir.mockResolvedValue({ estado: 'LIBERADA' });
    expect((await servicio.pagar(cliente, id, clave, 'tok_ok')).compraConfirmada).toBe(true);
    expect(reserva?.estado).toBe(EstadoReserva.CONSUMO_PENDIENTE);
    expect(actualizarConsumo).not.toHaveBeenCalled();
    expect(productos[0].cantidadInventario).toBe(3);
  });
  it('replays simultáneos de aprobación solo descuentan una vez', async () => {
    intentos.push({ id: clave, pedidoId: id, estado: Estado.APROBADA, monto: pedido.total, moneda: pedido.moneda } as TransaccionPedido);
    // El cierre Redis es idempotente; dos peticiones pueden observar CONSUMO_PENDIENTE.
    consumir.mockResolvedValue({ estado: 'CONSUMIDA' });
    await Promise.all([servicio.pagar(cliente, id, clave, 'tok_ok'), servicio.pagar(cliente, id, clave, 'tok_ok')]);
    expect(gestor.decrement).toHaveBeenCalledTimes(1);
    expect(productos[0].cantidadInventario).toBe(3);
    expect(cobrar).not.toHaveBeenCalled();
  });

});

describe('PagosController', () => {
  it('exige sesión válida, rol Cliente y responde 200 al finalizar', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PagosController)).toContain(SesionValida);
    expect(Reflect.getMetadata('roles-permitidos', PagosController)).toEqual(['Cliente']);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, PagosController.prototype.pagar)).toBe(200);
  });
  it('el pipe aplicado a la ruta rechaza clienteId y precios del body', async () => {
    const [validacion] = Reflect.getMetadata(PIPES_METADATA, PagosController.prototype.pagar) as ValidationPipe[];
    await expect(validacion.transform({ tokenPago: 'tok_ok', clienteId: cliente, monto: 1 }, { type: 'body', metatype: CrearPagoDto })).rejects.toThrow();
  });
  it('UsuarioActual ignora X-Usuario-Id y el parámetro pedidoId tiene validación UUID', async () => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, PagosController, 'pagar') as Record<string, { index: number; factory?: (data: unknown, ctx: ExecutionContext) => string; pipes?: ValidationPipe[] }>;
    const usuario = Object.values(args).find((arg) => arg.index === 0)!;
    const parametro = Object.values(args).find((arg) => arg.index === 1)!;
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ sesion: { usuarioId: cliente }, headers: { 'x-usuario-id': 'impostor' } }) }) } as unknown as ExecutionContext;
    expect(usuario.factory!(undefined, ctx)).toBe(cliente);
    await expect(parametro.pipes![0].transform('no-uuid', { type: 'param' })).rejects.toThrow();
  });
  it.each([[Estado.PENDIENTE, 'PAGO_PENDIENTE', 202], [Estado.FALLIDA, 'PASARELA_TIMEOUT', 504], [Estado.FALLIDA, 'PAGO_INCIERTO', 502]])('responde con código HTTP apropiado', async (estadoPago, codigo, status) => {
    const pagar = jest.fn().mockResolvedValue({ estadoPago, codigo });
    const controller = new PagosController({ pagar } as unknown as PagosService);
    await expect(controller.pagar(cliente, id, clave, { tokenPago: 'tok_ok' })).rejects.toMatchObject({ status });
  });
  it('pasa la identidad y no recibe cliente en el DTO', async () => {
    const resultado = { estadoPago: Estado.APROBADA } as PagoDto;
    const pagar = jest.fn().mockResolvedValue(resultado);
    expect(await new PagosController({ pagar } as unknown as PagosService).pagar(cliente, id, clave, { tokenPago: 'tok_ok' })).toBe(resultado);
    expect(pagar).toHaveBeenCalledWith(cliente, id, clave, 'tok_ok');
  });
  it.each([undefined, 'no-uuid'])('rechaza clave ausente o inválida', async (key) => {
    const pagar = jest.fn();
    await expect(new PagosController({ pagar } as unknown as PagosService).pagar(cliente, id, key as string, { tokenPago: 'tok_ok' })).rejects.toBeInstanceOf(HttpException);
    expect(pagar).not.toHaveBeenCalled();
  });
});
