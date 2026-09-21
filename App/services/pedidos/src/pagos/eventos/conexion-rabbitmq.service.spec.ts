import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { connect } from 'amqplib';
import { ConfiguracionServicio } from '../../config/configuracion';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { CLAVE_PEDIDO_CONFIRMADO, COLA_ESTABLECIMIENTOS, EXCHANGE_PEDIDOS } from './pedido-confirmado.evento';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

describe('Conexión para publicación de pedidos (AMQP simulado)', () => {
  let servicio: ConexionRabbitMq;
  const config = { rabbitmq: { url: 'amqp://broker-pruebas' } } as ConfiguracionServicio;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    (connect as jest.Mock).mockReset();
    servicio = new ConexionRabbitMq(config);
  });
  afterEach(async () => { await servicio.onApplicationShutdown(); jest.restoreAllMocks(); jest.useRealTimers(); });
  it('usa la configuración existente y declara un canal confirm y destino durable', async () => {
    const canal = Object.assign(new EventEmitter(), {
      assertExchange: jest.fn().mockResolvedValue({}), assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}), close: jest.fn().mockResolvedValue(undefined),
    });
    const conexion = Object.assign(new EventEmitter(), {
      createConfirmChannel: jest.fn().mockResolvedValue(canal), close: jest.fn().mockResolvedValue(undefined),
    });
    (connect as jest.Mock).mockResolvedValue(conexion);
    await servicio.onModuleInit();
    expect(connect).toHaveBeenCalledWith(config.rabbitmq.url, { timeout: 2000 });
    expect(canal.assertExchange).toHaveBeenCalledWith(EXCHANGE_PEDIDOS, 'topic', { durable: true });
    expect(canal.assertQueue).toHaveBeenCalledWith(COLA_ESTABLECIMIENTOS, { durable: true });
    expect(canal.bindQueue).toHaveBeenCalledWith(COLA_ESTABLECIMIENTOS, EXCHANGE_PEDIDOS, CLAVE_PEDIDO_CONFIRMADO);
    expect(servicio.obtenerCanal()).toBe(canal);
    await servicio.onApplicationShutdown();
    expect(canal.close).toHaveBeenCalledTimes(1);
    expect(conexion.close).toHaveBeenCalledTimes(1);
  });
  it('broker caído no impide arrancar; cierre cancela el reintento de conexión', async () => {
    (connect as jest.Mock).mockRejectedValue(new Error('broker no disponible'));
    await expect(servicio.onModuleInit()).resolves.toBeUndefined();
    expect(servicio.obtenerCanal()).toBeNull();
    await servicio.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(5000);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
