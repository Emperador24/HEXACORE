import { Logger } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { ConsumidorEntradaTransferida } from './consumidor-base';
import { EntradaTransferida } from './entrada-transferida.evento';
import { EVENTO_ENTRADA_TRANSFERIDA, MAXIMO_INTENTOS, VERSION_ENTRADA_TRANSFERIDA } from './topologia';

/**
 * Cómo se termina cada mensaje es lo que decide si un evento se pierde, se
 * procesa dos veces o bloquea la cola para siempre. Es además donde ya se coló
 * un fallo real: el contador de reintentos leía la cabecera `x-death`, que
 * RabbitMQ **solo** añade al pasar por la cola de muertos, así que con
 * `nack(requeue: true)` nunca subía y el mensaje rebotaba indefinidamente,
 * bloqueando a los siguientes por el `prefetch(1)`.
 *
 * Estas pruebas fijan ese comportamiento para que no vuelva a perderse.
 */

/** Consumidor de prueba: se le dice de antemano si debe fallar. */
class ConsumidorDePrueba extends ConsumidorEntradaTransferida {
  protected readonly log = new Logger('ConsumidorDePrueba');
  protected readonly cola = 'cola.de.prueba';

  /** Eventos que llegaron a `procesar`. Nombre distinto del `procesados`
   *  privado de la clase base, con el que chocaría. */
  recibidos: EntradaTransferida[] = [];
  fallar = false;

  constructor(conexion: ConexionRabbitMq) {
    super(conexion);
  }

  protected async procesar(evento: EntradaTransferida): Promise<void> {
    if (this.fallar) throw new Error('fallo simulado');
    this.recibidos.push(evento);
    await Promise.resolve();
  }

  /** Entrega un mensaje al consumidor como lo haría el broker. */
  async entregar(mensaje: ConsumeMessage): Promise<void> {
    // `recibir` es privado; se invoca por su nombre porque es justo el
    // comportamiento que estas pruebas existen para fijar.
    await (this as unknown as { recibir(m: ConsumeMessage): Promise<void> }).recibir(mensaje);
  }
}

function eventoValido(id = 'e1111111-1111-4111-8111-111111111111'): EntradaTransferida {
  return {
    evento: EVENTO_ENTRADA_TRANSFERIDA,
    version: VERSION_ENTRADA_TRANSFERIDA,
    id,
    ocurridoEn: new Date().toISOString(),
    entrada: {
      id: '20000000-0000-4000-8000-000000000001',
      numeroTicket: 'TCK-2026-000001',
      eventoId: 'e0000001-0000-4000-8000-000000000001',
      eventoNombre: 'HEXACORE Fest 2026',
      localidadNombre: 'General',
      codigoQrNuevo: 'HXC-QR-prueba',
    },
    transferencia: {
      vendedorId: 'a0000001-0000-4000-8000-000000000001',
      compradorId: 'a0000002-0000-4000-8000-000000000002',
      publicacionId: '30000000-0000-4000-8000-000000000001',
      transaccionId: id,
      numeroTransaccion: 'TXN-2026-000001',
    },
    importes: {
      precio: 300000,
      comision: 30000,
      netoVendedor: 270000,
      moneda: 'COP',
      referenciaPasarela: 'pas_prueba',
    },
  };
}

function mensajeCon(contenido: unknown): ConsumeMessage {
  const texto = typeof contenido === 'string' ? contenido : JSON.stringify(contenido);
  return {
    content: Buffer.from(texto),
    fields: { redelivered: false, deliveryTag: 1, exchange: '', routingKey: '' },
    properties: { headers: {} },
  } as unknown as ConsumeMessage;
}

describe('ConsumidorEntradaTransferida', () => {
  let canal: { ack: jest.Mock; nack: jest.Mock };
  let consumidor: ConsumidorDePrueba;

  beforeEach(() => {
    canal = { ack: jest.fn(), nack: jest.fn() };
    const conexion = { obtenerCanal: () => canal } as unknown as ConexionRabbitMq;
    consumidor = new ConsumidorDePrueba(conexion);
    // El log no aporta nada a la prueba y ensucia la salida.
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('procesa y confirma un evento válido', async () => {
    await consumidor.entregar(mensajeCon(eventoValido()));

    expect(consumidor.recibidos).toHaveLength(1);
    expect(canal.ack).toHaveBeenCalledTimes(1);
    expect(canal.nack).not.toHaveBeenCalled();
  });

  describe('lo que no se puede procesar va directo a la DLQ', () => {
    it('un JSON ilegible', async () => {
      await consumidor.entregar(mensajeCon('esto no es json'));

      // nack(mensaje, false, false) -> sin reencolar: a la cola de muertos.
      expect(canal.nack).toHaveBeenCalledWith(expect.anything(), false, false);
      expect(consumidor.recibidos).toHaveLength(0);
    });

    it('una versión del contrato que no se entiende', async () => {
      await consumidor.entregar(mensajeCon({ ...eventoValido(), version: 99 }));

      expect(canal.nack).toHaveBeenCalledWith(expect.anything(), false, false);
      expect(consumidor.recibidos).toHaveLength(0);
    });
  });

  describe('reintentos acotados', () => {
    it('reencola mientras queden intentos y manda a la DLQ al agotarlos', async () => {
      consumidor.fallar = true;
      const mensaje = mensajeCon(eventoValido());

      // Los primeros intentos vuelven a la cola.
      for (let i = 1; i < MAXIMO_INTENTOS; i++) {
        await consumidor.entregar(mensaje);
        expect(canal.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
      }

      // El último, no: si reencolara siempre, este mensaje giraría para siempre
      // y bloquearía la cola entera por el prefetch(1).
      await consumidor.entregar(mensaje);
      expect(canal.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
      expect(canal.nack).toHaveBeenCalledTimes(MAXIMO_INTENTOS);
    });

    it('cuenta los intentos aunque el broker no añada cabeceras', async () => {
      // RabbitMQ no marca los reintentos de un `nack(requeue: true)`: sin un
      // contador propio, el límite no se alcanzaría nunca.
      consumidor.fallar = true;
      const mensaje = mensajeCon(eventoValido());

      for (let i = 0; i < MAXIMO_INTENTOS; i++) await consumidor.entregar(mensaje);

      const ultima = canal.nack.mock.calls.at(-1);
      expect(ultima?.[2]).toBe(false);
    });

    it('un fallo pasajero no consume los intentos de otro evento', async () => {
      consumidor.fallar = true;
      await consumidor.entregar(mensajeCon(eventoValido('a1111111-1111-4111-8111-111111111111')));
      await consumidor.entregar(mensajeCon(eventoValido('b2222222-2222-4222-8222-222222222222')));

      // Ambos llevan un intento, ninguno agotado.
      expect(canal.nack).toHaveBeenCalledTimes(2);
      for (const llamada of canal.nack.mock.calls) expect(llamada[2]).toBe(true);
    });

    it('el contador se reinicia si el evento acaba procesándose', async () => {
      const mensaje = mensajeCon(eventoValido());
      consumidor.fallar = true;
      await consumidor.entregar(mensaje);

      consumidor.fallar = false;
      await consumidor.entregar(mensaje);

      expect(canal.ack).toHaveBeenCalledTimes(1);
      expect(consumidor.recibidos).toHaveLength(1);
    });
  });

  describe('entrega repetida', () => {
    it('descarta un evento ya procesado sin volver a ejecutarlo', async () => {
      // RabbitMQ entrega "al menos una vez". Sin esto se mandarían dos correos
      // o se pagaría dos veces al vendedor.
      const mensaje = mensajeCon(eventoValido());
      await consumidor.entregar(mensaje);
      await consumidor.entregar(mensaje);

      expect(consumidor.recibidos).toHaveLength(1);
      // El repetido se confirma igual: dejarlo sin confirmar lo devolvería a la
      // cola una y otra vez.
      expect(canal.ack).toHaveBeenCalledTimes(2);
      expect(canal.nack).not.toHaveBeenCalled();
    });

    it('distingue eventos distintos', async () => {
      await consumidor.entregar(mensajeCon(eventoValido('a1111111-1111-4111-8111-111111111111')));
      await consumidor.entregar(mensajeCon(eventoValido('b2222222-2222-4222-8222-222222222222')));

      expect(consumidor.recibidos).toHaveLength(2);
    });
  });
});
