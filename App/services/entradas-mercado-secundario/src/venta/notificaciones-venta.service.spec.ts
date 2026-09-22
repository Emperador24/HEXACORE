import { ConsumeMessage } from 'amqplib';
import { ConexionRabbitMq } from '../reventa/eventos/conexion-rabbitmq.service';
import {
  COLA_NOTIFICACIONES_VENTA,
  EXCHANGE_VENTAS,
  EventoVenta,
  NotificacionesVenta,
} from './notificaciones-venta.service';

/**
 * Paso 8 del CU-001 y paso 9 del CU-003 por la cola (ADR-10). El canal de
 * RabbitMQ es un doble: se comprueba qué publica, qué confirma y qué manda a
 * la DLQ. Contra el broker real se vio salir cada correo en el registro.
 */
describe('NotificacionesVenta', () => {
  const evento: EventoVenta = {
    id: 'confirmada:compra-1',
    tipo: 'COMPRA_CONFIRMADA',
    version: 1,
    ocurridoEn: '2026-09-19T20:00:00Z',
    clienteId: 'a0000001-0000-4000-8000-000000000001',
    numeroCompra: 'CMP-2026-000001',
    eventoNombre: 'HEXACORE Fest',
    entradas: [{ numeroTicket: 'TCK-1', localidadNombre: 'General', codigoQr: 'HXC-QR-1' }],
    monto: 324000,
  };

  function construir(conCanal = true) {
    let alRecibir: ((m: ConsumeMessage | null) => void) | undefined;
    const canal = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest.fn((_cola: string, cb: (m: ConsumeMessage | null) => void) => {
        alRecibir = cb;
        return Promise.resolve({ consumerTag: 'c1' });
      }),
      publish: jest.fn((_ex: string, _clave: string, _cuerpo: Buffer, _op: object, confirmar: (e?: Error) => void) => confirmar()),
      ack: jest.fn(),
      nack: jest.fn(),
    };
    const conexion = { obtenerCanal: () => (conCanal ? canal : null), registrarAlReconectar: jest.fn() };
    const servicio = new NotificacionesVenta(conexion as unknown as ConexionRabbitMq);
    const entregar = async (contenido: string) => {
      alRecibir!({ content: Buffer.from(contenido) } as ConsumeMessage);
      await new Promise((r) => setImmediate(r));
    };
    return { servicio, canal, conexion, entregar };
  }

  it('declara su cola con DLQ y se apunta para resuscribirse tras una reconexión', async () => {
    const { servicio, canal, conexion } = construir();

    await servicio.onApplicationBootstrap();

    expect(conexion.registrarAlReconectar).toHaveBeenCalled();
    expect(canal.assertQueue).toHaveBeenCalledWith(COLA_NOTIFICACIONES_VENTA, expect.objectContaining({ deadLetterExchange: 'ventas.muertos' }));
    expect(canal.bindQueue).toHaveBeenCalledWith(COLA_NOTIFICACIONES_VENTA, EXCHANGE_VENTAS, 'compra.*');
  });

  it('publica persistente, con el id del hecho para descartar duplicados', async () => {
    const { servicio, canal } = construir();

    expect(await servicio.publicar(evento)).toBe(true);
    expect(canal.publish).toHaveBeenCalledWith(
      EXCHANGE_VENTAS,
      'compra.confirmada',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, messageId: evento.id }),
      expect.any(Function),
    );
  });

  it('sin broker no lanza: la compra ya está hecha', async () => {
    const { servicio } = construir(false);
    await expect(servicio.publicar(evento)).resolves.toBe(false);
  });

  it('procesa, confirma y descarta el duplicado', async () => {
    const { servicio, canal, entregar } = construir();
    await servicio.onApplicationBootstrap();

    await entregar(JSON.stringify(evento));
    await entregar(JSON.stringify(evento));

    expect(canal.ack).toHaveBeenCalledTimes(2);
    expect(canal.nack).not.toHaveBeenCalled();
  });

  it.each([
    ['un JSON ilegible', '{no es json'],
    ['una versión desconocida', JSON.stringify({ ...evento, version: 99 })],
  ])('manda %s a la DLQ sin reintentar', async (_caso, contenido) => {
    const { servicio, canal, entregar } = construir();
    await servicio.onApplicationBootstrap();

    await entregar(contenido);

    expect(canal.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('reintenta un fallo pasajero y, al tercero, lo manda a la DLQ', async () => {
    const { servicio, canal, entregar } = construir();
    jest.spyOn(servicio as unknown as { notificar: () => Promise<void> }, 'notificar').mockRejectedValue(new Error('proveedor caído'));
    await servicio.onApplicationBootstrap();

    for (let i = 0; i < 3; i++) await entregar(JSON.stringify({ ...evento, tipo: 'COMPRA_CANCELADA' }));

    expect(canal.nack.mock.calls.map((c) => c[2])).toEqual([true, true, false]);
  });
});
