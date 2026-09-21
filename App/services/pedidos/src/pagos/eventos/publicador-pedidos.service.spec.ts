import { Logger } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { PublicadorPedidos } from './publicador-pedidos.service';
import { CLAVE_PEDIDO_CONFIRMADO, EVENTO_PEDIDO_CONFIRMADO, EXCHANGE_PEDIDOS, PedidoConfirmado } from './pedido-confirmado.evento';

const evento: PedidoConfirmado = {
  pedidoId: '50000000-0000-4000-8000-000000000001', establecimientoId: '30000000-0000-4000-8000-000000000001',
  clienteId: 'a0000001-0000-4000-8000-000000000001', total: '25000.00', moneda: 'COP',
  metodoEntrega: 'Mostrador', puntoEntrega: 'Zona gastronómica - Módulo 4',
  productos: [{ productoId: '40000000-0000-4000-8000-000000000001', nombreProducto: 'Hamburguesa', cantidad: 1, precioUnitario: '25000.00' }],
  confirmadoEn: '2026-09-21T12:00:00.000Z',
};
const publicadorCon = (canal: { publish: jest.Mock } | null) =>
  new PublicadorPedidos({ obtenerCanal: () => canal } as unknown as ConexionRabbitMq);

describe('PublicadorPedidos', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
  it('publica JSON persistente con routing key, tipo y messageId estable, esperando confirmación', async () => {
    let confirmar!: (error: Error | null) => void;
    const publish = jest.fn((_exchange, _clave, _body, _options, callback) => { confirmar = callback; return false; });
    const resultado = publicadorCon({ publish }).publicarPedidoConfirmado(evento);
    expect(publish).toHaveBeenCalledTimes(1);
    const [exchange, clave, body, opciones] = publish.mock.calls[0];
    expect(exchange).toBe(EXCHANGE_PEDIDOS);
    expect(clave).toBe(CLAVE_PEDIDO_CONFIRMADO);
    expect(JSON.parse(body.toString())).toEqual(evento);
    expect(opciones).toEqual({ persistent: true, contentType: 'application/json', messageId: evento.pedidoId,
      type: EVENTO_PEDIDO_CONFIRMADO, timestamp: expect.any(Number) });
    confirmar(null); // publish=false es backpressure, no un rechazo del broker.
    await expect(resultado).resolves.toBe(true);
  });
  it('sin canal registra el fallo y no lanza', async () => {
    await expect(publicadorCon(null).publicarPedidoConfirmado(evento)).resolves.toBe(false);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining(evento.pedidoId));
  });
  it('un nack del broker se registra sin propagar error', async () => {
    const publish = jest.fn((_e, _k, _b, _o, callback) => { callback(new Error('nack')); return true; });
    await expect(publicadorCon({ publish }).publicarPedidoConfirmado(evento)).resolves.toBe(false);
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });
  it('una excepción de publicación no filtra payloads ni revierte la compra', async () => {
    const publish = jest.fn(() => { throw new Error('dato sensible'); });
    await expect(publicadorCon({ publish }).publicarPedidoConfirmado(evento)).resolves.toBe(false);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('PEDIDO_CONFIRMADO_NO_PUBLICADO'));
    expect(JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls)).not.toContain('dato sensible');
  });
  it('acota la espera del confirm sin reenviar el mensaje', async () => {
    jest.useFakeTimers();
    const publish = jest.fn(() => true);
    const resultado = publicadorCon({ publish }).publicarPedidoConfirmado(evento);
    await jest.advanceTimersByTimeAsync(2000);
    await expect(resultado).resolves.toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });
});
