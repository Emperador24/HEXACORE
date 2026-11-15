import type { ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { ConsumidorIngresosMonitoreo } from './consumidor-ingresos.service';

/** CU-019, paso 2: las ramas del consumidor que la e2e no alcanza sin romper la base a mitad. */
describe('ConsumidorIngresosMonitoreo (CU-019)', () => {
  let canal: { ack: jest.Mock; nack: jest.Mock };
  let conexion: { obtenerCanal: jest.Mock; registrarTopologia: jest.Mock; registrarAlReconectar: jest.Mock; consumir: jest.Mock };
  let datos: { transaction: jest.Mock };
  let consumidor: ConsumidorIngresosMonitoreo;
  const procesar = (m: ConsumeMessage | null) => (consumidor as unknown as { procesar(m: ConsumeMessage | null): Promise<void> }).procesar(m);
  const mensaje = (cuerpo: unknown) => ({ content: Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) }) as ConsumeMessage;
  const ingreso = () => ({ id: randomUUID(), tipo: 'INGRESO_REGISTRADO', eventoId: randomUUID(), puntoAcceso: 'Puerta 1', escaneadoEn: new Date().toISOString() });

  beforeEach(() => {
    canal = { ack: jest.fn(), nack: jest.fn() };
    conexion = { obtenerCanal: jest.fn(() => canal), registrarTopologia: jest.fn(), registrarAlReconectar: jest.fn(), consumir: jest.fn(async () => undefined) };
    datos = { transaction: jest.fn(async (f: (m: { query: jest.Mock }) => Promise<void>) => f({ query: jest.fn() })) };
    consumidor = new ConsumidorIngresosMonitoreo(conexion as unknown as ConexionRabbitMq, datos as unknown as DataSource);
  });

  it('se suscribe al conectar', async () => {
    consumidor.onModuleInit();
    await conexion.registrarAlReconectar.mock.calls[0][0]();
    expect(conexion.consumir).toHaveBeenCalledTimes(1);
  });

  it('guarda y confirma un ingreso válido; ignora un mensaje vacío o sin canal', async () => {
    await procesar(null);
    conexion.obtenerCanal.mockReturnValueOnce(null);
    await procesar(mensaje(ingreso()));
    await procesar(mensaje(ingreso()));
    expect(canal.ack).toHaveBeenCalledTimes(1);
  });

  it('un mensaje ilegible o con campos inválidos va directo a la DLQ', async () => {
    await procesar(mensaje('{roto'));
    await procesar(mensaje({ ...ingreso(), escaneadoEn: 'ayer' }));
    await procesar(mensaje({ ...ingreso(), puntoAcceso: '' }));
    expect(canal.nack.mock.calls.map((c) => c[2])).toEqual([false, false, false]);
  });

  it('con la base caída reencola hasta el máximo de intentos y entonces lo suelta', async () => {
    datos.transaction.mockRejectedValue(new Error('base caída'));
    const m = mensaje(ingreso());
    for (let i = 0; i < 6; i++) await procesar(m);
    const reencolados = canal.nack.mock.calls.map((c) => c[2]);
    expect(reencolados[0]).toBe(true);
    expect(reencolados).toContain(false);
  });
});
