import type { ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { NotificadorReservas } from '../../parqueaderos/reservas/notificador-reservas.service';
import { NotificadorEvacuacion } from './notificador-evacuacion.service';

/**
 * Las bandejas de salida de CU-010 y CU-021 tienen la misma forma: se prueban
 * juntas las ramas que las e2e no alcanzan sin tumbar el broker a mitad de un
 * envío (publicación fallida, mensaje ilegible, base caída al entregar).
 */
describe.each([
  ['NotificadorEvacuacion (CU-010)', NotificadorEvacuacion, 'notificaciones_evacuacion'],
  ['NotificadorReservas (CU-021)', NotificadorReservas, 'notificaciones_reserva'],
] as const)('%s', (_nombre, Clase, tabla) => {
  const aviso = () => ({ id: randomUUID(), evacuacion_id: randomUUID(), reserva_id: randomUUID(), cliente_id: randomUUID(), canal: 'APP', zona_id: null, mensaje: 'Hola', prioridad: 5 });
  let canal: { sendToQueue: jest.Mock; ack: jest.Mock; nack: jest.Mock };
  let conexion: { obtenerCanal: jest.Mock; registrarTopologia: jest.Mock; registrarAlReconectar: jest.Mock; consumir: jest.Mock };
  let consultas: { sql: string; params?: unknown[] }[];
  let pendientes: ReturnType<typeof aviso>[];
  let datos: { transaction: jest.Mock; query: jest.Mock };
  let servicio: NotificadorEvacuacion | NotificadorReservas;
  const mensaje = (cuerpo: unknown) => ({ content: Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) }) as ConsumeMessage;
  const entregar = (m: ConsumeMessage | null) => (servicio as unknown as { entregar(m: ConsumeMessage | null): Promise<void> }).entregar(m);

  beforeEach(() => {
    consultas = [];
    pendientes = [];
    canal = { sendToQueue: jest.fn((_c, _b, _o, listo: (e?: Error) => void) => listo()), ack: jest.fn(), nack: jest.fn() };
    conexion = { obtenerCanal: jest.fn(() => canal), registrarTopologia: jest.fn(), registrarAlReconectar: jest.fn(), consumir: jest.fn(async () => undefined) };
    const gestor = { query: jest.fn(async (sql: string, params?: unknown[]) => { consultas.push({ sql, params }); return sql.startsWith('SELECT') ? pendientes : []; }) };
    datos = { transaction: jest.fn(async (f: (g: typeof gestor) => Promise<void>) => f(gestor)), query: jest.fn(async () => [[], 1]) };
    servicio = new Clase(conexion as unknown as ConexionRabbitMq, datos as unknown as DataSource);
  });

  afterEach(async () => { await servicio.onModuleDestroy(); });

  it('al iniciar registra su topología y, al conectar, consume y despacha', async () => {
    servicio.onModuleInit();
    expect(conexion.registrarTopologia).toHaveBeenCalledTimes(1);
    await conexion.registrarAlReconectar.mock.calls[0][0]();
    expect(conexion.consumir).toHaveBeenCalledTimes(1);
  });

  it('sin canal no despacha; dos despachos a la vez comparten el mismo trabajo', async () => {
    conexion.obtenerCanal.mockReturnValueOnce(null);
    expect(await servicio.despachar()).toBe(0);
    pendientes = [aviso(), aviso()];
    const [a, b] = [servicio.despachar(), servicio.despachar()];
    expect(await a).toBe(2);
    expect(await b).toBe(2);
    expect(consultas.filter((c) => c.sql.includes('publicada_en = now()'))).toHaveLength(2);
  });

  it('si el broker rechaza un aviso, suma el intento y deja el resto para el próximo ciclo', async () => {
    pendientes = [aviso(), aviso()];
    canal.sendToQueue.mockImplementationOnce((_c, _b, _o, listo: (e?: Error) => void) => listo(new Error('nack del broker')));
    expect(await servicio.despachar()).toBe(0);
    expect(consultas.filter((c) => c.sql.startsWith(`UPDATE ${tabla} SET intentos`))).toHaveLength(1);
    expect(canal.sendToQueue).toHaveBeenCalledTimes(1);
  });

  it('con la base caída aplaza el despacho sin reventar, y cerrando no despacha', async () => {
    datos.transaction.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await servicio.despachar()).toBe(0);
    await servicio.onModuleDestroy();
    expect(await servicio.despachar()).toBe(0);
  });

  it('entrega: confirma lo válido, manda a la DLQ lo ilegible y reintenta si falla la base', async () => {
    await entregar(null);
    const id = randomUUID();
    await entregar(mensaje({ id, clienteId: randomUUID(), mensaje: 'Tu QR' }));
    expect(canal.ack).toHaveBeenCalledTimes(1);

    await entregar(mensaje('{no es json'));
    await entregar(mensaje({ id: 'no-uuid' }));
    expect(canal.nack).toHaveBeenNthCalledWith(1, expect.anything(), false, false);
    expect(canal.nack).toHaveBeenNthCalledWith(2, expect.anything(), false, false);

    datos.query.mockRejectedValue(new Error('base caída'));
    const roto = mensaje({ id, clienteId: randomUUID(), mensaje: 'Tu QR' });
    for (let i = 0; i < 5; i++) await entregar(roto);
    const requeue = canal.nack.mock.calls.slice(2).map((c) => c[2]);
    expect(requeue[0]).toBe(true);
    expect(requeue).toContain(false);
  });
});
