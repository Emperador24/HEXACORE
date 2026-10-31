import { Logger } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { EntradaTransferida } from './entrada-transferida.evento';
import { PublicadorEventos } from './publicador-eventos.service';
import {
  CLAVE_ENTRADA_TRANSFERIDA,
  EVENTO_ENTRADA_TRANSFERIDA,
  EXCHANGE_REVENTA,
  VERSION_ENTRADA_TRANSFERIDA,
} from './topologia';

/**
 * Lo que más importa de este componente es que **nunca lance**.
 *
 * Cuando se le llama, el comprador ya pagó y la entrada ya cambió de dueño en
 * la base. Si una excepción suya subiera hasta el controlador, la petición
 * fallaría y se le diría al comprador que su compra no se hizo — cuando sí se
 * hizo. El diagrama de secuencia es explícito: publicar queda *"fuera del
 * camino de respuesta"*.
 */
describe('PublicadorEventos', () => {
  function evento(): EntradaTransferida {
    return {
      evento: EVENTO_ENTRADA_TRANSFERIDA,
      version: VERSION_ENTRADA_TRANSFERIDA,
      id: '7f3c1e2a-5d4b-4c8e-9a1f-2b3c4d5e6f70',
      ocurridoEn: new Date().toISOString(),
      entrada: {
        id: '20000000-0000-4000-8000-000000000001',
        numeroTicket: 'TCK-2026-000001',
        eventoId: 'e0000001-0000-4000-8000-000000000001',
        eventoNombre: 'HEXACORE Fest 2026',
        localidadNombre: 'General',
        codigoQrNuevo: 'HXC-QR-nuevo',
      },
      transferencia: {
        vendedorId: 'a0000001-0000-4000-8000-000000000001',
        compradorId: 'a0000002-0000-4000-8000-000000000002',
        publicacionId: '30000000-0000-4000-8000-000000000001',
        transaccionId: '7f3c1e2a-5d4b-4c8e-9a1f-2b3c4d5e6f70',
        numeroTransaccion: 'TXN-2026-000008',
      },
      importes: {
        precio: 300000,
        comision: 30000,
        netoVendedor: 270000,
        moneda: 'COP',
        referenciaPasarela: 'pas_abc',
      },
    };
  }

  /** Doble del canal. `confirmar` decide si el broker acepta el mensaje. */
  function conexionCon(canal: { publish: jest.Mock } | null): ConexionRabbitMq {
    return { obtenerCanal: () => canal } as unknown as ConexionRabbitMq;
  }

  function canalQue(confirma: boolean): { publish: jest.Mock } {
    return {
      publish: jest.fn((_e, _c, _contenido, _opciones, callback: (error: unknown) => void) => {
        callback(confirma ? null : new Error('el broker rechazó el mensaje'));
        return true;
      }),
    };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('publica en el exchange y con la clave de enrutado correctos', async () => {
    const canal = canalQue(true);
    const publicador = new PublicadorEventos(conexionCon(canal));

    await expect(publicador.publicarEntradaTransferida(evento())).resolves.toBe(true);

    const [exchange, clave] = canal.publish.mock.calls[0] as [string, string];
    expect(exchange).toBe(EXCHANGE_REVENTA);
    expect(clave).toBe(CLAVE_ENTRADA_TRANSFERIDA);
  });

  it('marca el mensaje como persistente', async () => {
    const canal = canalQue(true);
    const publicador = new PublicadorEventos(conexionCon(canal));

    await publicador.publicarEntradaTransferida(evento());

    // Sin `persistent`, un reinicio del broker se llevaría por delante las
    // transferencias en vuelo. Es el modo duradero que midió el PoC-05.
    const opciones = canal.publish.mock.calls[0][3] as { persistent: boolean; messageId: string };
    expect(opciones.persistent).toBe(true);
  });

  it('usa el id de la transacción como messageId', async () => {
    const canal = canalQue(true);
    const publicador = new PublicadorEventos(conexionCon(canal));
    const carga = evento();

    await publicador.publicarEntradaTransferida(carga);

    // Es la clave con la que un consumidor descarta una entrega repetida.
    const opciones = canal.publish.mock.calls[0][3] as { messageId: string };
    expect(opciones.messageId).toBe(carga.transferencia.transaccionId);
  });

  it('envía el evento serializado tal cual', async () => {
    const canal = canalQue(true);
    const publicador = new PublicadorEventos(conexionCon(canal));
    const carga = evento();

    await publicador.publicarEntradaTransferida(carga);

    const contenido = canal.publish.mock.calls[0][2] as Buffer;
    expect(JSON.parse(contenido.toString())).toEqual(carga);
  });

  describe('nunca lanza', () => {
    it('devuelve false, sin lanzar, si no hay conexión con el broker', async () => {
      const publicador = new PublicadorEventos(conexionCon(null));

      await expect(publicador.publicarEntradaTransferida(evento())).resolves.toBe(false);
    });

    it('devuelve false si el broker no confirma el mensaje', async () => {
      const publicador = new PublicadorEventos(conexionCon(canalQue(false)));

      await expect(publicador.publicarEntradaTransferida(evento())).resolves.toBe(false);
    });

    it('devuelve false si publicar revienta', async () => {
      const canal = {
        publish: jest.fn(() => {
          throw new Error('canal cerrado');
        }),
      };
      const publicador = new PublicadorEventos(conexionCon(canal));

      await expect(publicador.publicarEntradaTransferida(evento())).resolves.toBe(false);
    });
  });

  it('deja constancia en el log cuando no se pudo publicar', async () => {
    // Un evento perdido no puede desaparecer en silencio: ASR-07 exige que la
    // auditoría no pierda nada sin dejar rastro.
    const error = jest.spyOn(Logger.prototype, 'error');
    const publicador = new PublicadorEventos(conexionCon(null));

    await publicador.publicarEntradaTransferida(evento());

    expect(error).toHaveBeenCalledWith(expect.stringContaining('TXN-2026-000008'));
  });
});
