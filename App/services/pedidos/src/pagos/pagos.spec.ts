import { ExecutionContext, HttpException, ValidationPipe } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { TransaccionPedido, EstadoTransaccionPedido as Estado } from '../persistencia/entidades/transaccion-pedido.entity';
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
  let gestor: { findOne: jest.Mock; findOneOrFail: jest.Mock; find: jest.Mock; create: jest.Mock; insert: jest.Mock; save: jest.Mock };
  let dentro: boolean;
  beforeEach(() => {
    pedido = Object.assign(new Pedido(), { id, clienteId: cliente, total: '25000.00', moneda: 'COP', estado: EstadoPedido.PENDIENTE_PAGO, expiraEn: new Date(Date.now() + 600000), codigoQr: null, confirmadoEn: null });
    intentos = [];
    dentro = false;
    gestor = {
      findOne: jest.fn(async (tipo, opciones) => tipo === Pedido
        ? opciones.where.clienteId && opciones.where.clienteId !== cliente ? null : pedido
        : intentos.find((t) => t.id === opciones.where.id) ?? null),
      findOneOrFail: jest.fn(async (tipo, opciones) => tipo === Pedido ? pedido : intentos.find((t) => t.id === opciones.where.id)),
      find: jest.fn(async () => intentos),
      create: jest.fn((_tipo, datos) => ({ ...datos })),
      insert: jest.fn(async (_tipo, datos) => { intentos.push(datos); }),
      save: jest.fn(async (_tipo, datos) => datos),
    };
    // Serializa callbacks como el bloqueo de Pedido; no sustituye una prueba real de PostgreSQL.
    let cola = Promise.resolve();
    const transaction = <T>(trabajo: (tx: EntityManager) => Promise<T>): Promise<T> => {
      const resultado = cola.then(async () => { dentro = true; try { return await trabajo(gestor as unknown as EntityManager); } finally { dentro = false; } });
      cola = resultado.then(() => undefined, () => undefined);
      return resultado;
    };
    cobrar = jest.fn(async () => { expect(dentro).toBe(false); return aprobado; });
    servicio = new PagosService({ transaction } as DataSource, { cobrar } as unknown as PasarelaHttp);
  });
  const errorCodigo = async (promesa: Promise<unknown>, codigo: string) => {
    await expect(promesa).rejects.toMatchObject({ response: { codigo } });
  };
  it('cobra el total guardado, registra aprobación y no confirma el pedido', async () => {
    const resultado = await servicio.pagar(cliente, id, clave, 'tok_secreto');
    expect(cobrar).toHaveBeenCalledWith(clave, '25000.00', 'COP', 'tok_secreto');
    expect(resultado).toMatchObject({ estadoPago: Estado.APROBADA, estadoPedido: EstadoPedido.PENDIENTE_PAGO, compraConfirmada: false });
    expect(pedido).toMatchObject({ codigoQr: null, confirmadoEn: null });
    expect(gestor.findOne).toHaveBeenCalledWith(Pedido, { where: { id, clienteId: cliente }, lock: { mode: 'pessimistic_write' } });
    expect(gestor.save.mock.calls.every(([tipo]) => tipo === TransaccionPedido)).toBe(true);
    expect(JSON.stringify(intentos)).not.toContain('tok_secreto');
  });
  it('repite aprobación aun vencido sin cobrar y bloquea otra clave', async () => {
    const primero = await servicio.pagar(cliente, id, clave, 'tok_ok');
    pedido.expiraEn = new Date(0);
    expect(await servicio.pagar(cliente, id, clave, 'tok_otro')).toEqual(primero);
    await errorCodigo(servicio.pagar(cliente, id, otraClave, 'tok_otro'), 'PEDIDO_YA_PAGADO');
    expect(cobrar).toHaveBeenCalledTimes(1);
  });
  it('conserva rechazo y permite un nuevo intento mientras esté vigente', async () => {
    cobrar.mockResolvedValueOnce({ estado: Estado.RECHAZADA, referenciaPasarela: aprobado.referenciaPasarela, motivo: 'PAGO_RECHAZADO' });
    await servicio.pagar(cliente, id, clave, 'tok_rechazo');
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
    expect(pedido.estado).toBe(EstadoPedido.PENDIENTE_PAGO);
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
