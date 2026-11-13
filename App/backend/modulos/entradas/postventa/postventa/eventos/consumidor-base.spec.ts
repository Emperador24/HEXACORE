import { Logger } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { ConsumidorEntradaTransferida } from './consumidor-base';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { EntradaTransferida } from './entrada-transferida.evento';
import { MAXIMO_INTENTOS, VERSION_ENTRADA_TRANSFERIDA } from './topologia';

/**
 * CU-006, pasos 10-11: el consumidor común de ENTRADA_TRANSFERIDA (liquidación
 * y notificación) ante el broker que se cae, mensajes ilegibles y fallos que se
 * agotan.
 */
class Consumidor extends ConsumidorEntradaTransferida {
  protected readonly log = new Logger('Prueba');
  protected readonly cola = 'reventa.prueba';
  fallar = false;
  constructor(conexion: ConexionRabbitMq) {
    super(conexion);
  }
  async procesar(): Promise<void> {
    if (this.fallar) throw new Error('base caída');
  }
}

describe('ConsumidorEntradaTransferida', () => {
  let canal: { prefetch: jest.Mock; ack: jest.Mock; nack: jest.Mock };
  let conexion: { obtenerCanal: jest.Mock; registrarAlReconectar: jest.Mock; consumir: jest.Mock; cancelarConsumo: jest.Mock };
  let entregar: (m: ConsumeMessage | null) => unknown;
  let consumidor: Consumidor;
  const mensaje = (cuerpo: unknown) => ({ content: Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) }) as ConsumeMessage;
  const evento = (id = 'e1', version: unknown = VERSION_ENTRADA_TRANSFERIDA) =>
    ({ id, version, transferencia: { numeroTransaccion: 'TRV-1' } }) as unknown as EntradaTransferida;

  beforeEach(async () => {
    canal = { prefetch: jest.fn(), ack: jest.fn(), nack: jest.fn() };
    conexion = {
      obtenerCanal: jest.fn(() => canal),
      registrarAlReconectar: jest.fn(),
      consumir: jest.fn(async (_c: string, f: (m: ConsumeMessage | null) => unknown) => { entregar = f; return { consumerTag: 'tag' }; }),
      cancelarConsumo: jest.fn(),
    };
    consumidor = new Consumidor(conexion as unknown as ConexionRabbitMq);
    await consumidor.onApplicationBootstrap();
  });

  it('sin broker al arrancar, reintenta suscribirse más tarde', async () => {
    jest.useFakeTimers();
    try {
      conexion.obtenerCanal.mockReturnValueOnce(null);
      const otro = new Consumidor(conexion as unknown as ConexionRabbitMq);
      await otro.onApplicationBootstrap();
      expect(conexion.consumir).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000);
      expect(conexion.consumir).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('confirma lo procesado, descarta repetidos y manda a la DLQ lo ilegible o de otra versión', async () => {
    await entregar(null);
    await entregar(mensaje(evento()));
    await entregar(mensaje(evento()));
    expect(canal.ack).toHaveBeenCalledTimes(2);
    await entregar(mensaje('{roto'));
    await entregar(mensaje(evento('e2', 99)));
    expect(canal.nack.mock.calls.map((c) => c[2])).toEqual([false, false]);
  });

  it('reintenta un fallo y al agotar los intentos lo manda a la DLQ', async () => {
    consumidor.fallar = true;
    for (let i = 0; i < MAXIMO_INTENTOS; i++) await entregar(mensaje(evento('e3')));
    const requeue = canal.nack.mock.calls.map((c) => c[2]);
    expect(requeue.slice(0, -1).every(Boolean)).toBe(true);
    expect(requeue.at(-1)).toBe(false);
  });

  it('con el canal caído o cerrado al confirmar, no revienta: el mensaje se reentregará', async () => {
    conexion.obtenerCanal.mockReturnValueOnce(null);
    await entregar(mensaje(evento('e4')));
    canal.ack.mockImplementationOnce(() => { throw new Error('Channel closed'); });
    await entregar(mensaje(evento('e5')));
    expect(canal.ack).toHaveBeenCalledTimes(1);
  });

  it('un error que escapa del procesamiento queda registrado, no tumba el proceso', async () => {
    jest.spyOn(consumidor as never, 'recibir').mockRejectedValueOnce(new Error('inesperado') as never);
    await expect(entregar(mensaje(evento('e6')))).resolves.toBeUndefined();
  });

  it('al apagar cancela su suscripción, aunque el canal ya esté cerrado', async () => {
    conexion.cancelarConsumo.mockRejectedValueOnce(new Error('cerrado'));
    await expect(consumidor.onApplicationShutdown()).resolves.toBeUndefined();
    expect(conexion.cancelarConsumo).toHaveBeenCalledWith('tag');
  });
});
