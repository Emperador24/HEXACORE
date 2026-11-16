import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../rabbitmq/conexion-rabbitmq.service';
import { BandejaSalida } from './bandeja-salida.service';

/** Outbox de Acceso QR: el lote sale entero y solo se marca lo confirmado hasta el primer fallo. */
describe('BandejaSalida de Acceso QR', () => {
  const pendientes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      secuencia: String(i + 1), exchange: 'acceso.eventos', clave: 'ingreso.registrado', cuerpo: { id: `ingreso-${i + 1}` },
    }));

  function montar(lote: ReturnType<typeof pendientes>, fallan: number[] = []) {
    const confirmar: Array<() => void> = [];
    const canal = {
      assertExchange: jest.fn(async () => undefined),
      // Las confirmaciones llegan después de publicar todo el lote, como con el broker real.
      publish: jest.fn((_e: string, _c: string, _b: Buffer, _o: object, listo: (error?: Error) => void) => {
        const n = confirmar.length + 1;
        confirmar.push(() => listo(fallan.includes(n) ? new Error('nack') : undefined));
        if (confirmar.length === lote.length) setImmediate(() => confirmar.forEach((c) => c()));
        return true;
      }),
    };
    const consulta = { where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(), setLock: jest.fn(), setOnLocked: jest.fn(), getMany: jest.fn(async () => lote) };
    for (const paso of ['where', 'orderBy', 'limit', 'setLock', 'setOnLocked'] as const) consulta[paso].mockReturnValue(consulta);
    const tx = { createQueryBuilder: jest.fn(() => consulta), update: jest.fn(async () => undefined) };
    const datos = { transaction: jest.fn(async (f: (m: typeof tx) => Promise<number>) => f(tx)) };
    const conexion = { obtenerCanal: jest.fn(() => canal) };
    const bandeja = new BandejaSalida(datos as unknown as DataSource, conexion as unknown as ConexionRabbitMq);
    return { bandeja, canal, tx, consulta };
  }

  it('publica el lote completo antes de esperar confirmaciones y lo marca de una vez', async () => {
    const { bandeja, canal, tx, consulta } = montar(pendientes(3));
    await expect(bandeja.publicarPendientes()).resolves.toBe(3);
    expect(canal.publish).toHaveBeenCalledTimes(3);
    expect(canal.publish.mock.calls.map((c) => JSON.parse(c[2].toString()).secuencia)).toEqual([1, 2, 3]);
    expect(consulta.limit).toHaveBeenCalledWith(500);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect((tx.update.mock.calls[0] as unknown[])[1]).toMatchObject({ secuencia: expect.objectContaining({ _value: ['1', '2', '3'] }) });
  });

  it('si el broker rechaza uno, solo marca los anteriores: el resto vuelve a salir en orden', async () => {
    const { bandeja, tx } = montar(pendientes(4), [3]);
    await expect(bandeja.publicarPendientes()).resolves.toBe(2);
    expect((tx.update.mock.calls[0] as unknown[])[1]).toMatchObject({ secuencia: expect.objectContaining({ _value: ['1', '2'] }) });
  });

  it('si falla el primero no marca nada', async () => {
    const { bandeja, tx } = montar(pendientes(2), [1]);
    await expect(bandeja.publicarPendientes()).resolves.toBe(0);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('sin canal no toca la base', async () => {
    const { bandeja, canal, tx } = montar(pendientes(1));
    (bandeja as unknown as { conexion: { obtenerCanal: () => null } }).conexion.obtenerCanal = () => null;
    await expect(bandeja.publicarPendientes()).resolves.toBe(0);
    expect(canal.publish).not.toHaveBeenCalled();
    expect(tx.createQueryBuilder).not.toHaveBeenCalled();
  });
});
