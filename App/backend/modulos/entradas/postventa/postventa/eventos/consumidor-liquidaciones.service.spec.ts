import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoTransaccion, TransaccionReventa } from '../../persistencia/entidades/transaccion-reventa.entity';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { ConsumidorLiquidaciones } from './consumidor-liquidaciones.service';
import { EntradaTransferida } from './entrada-transferida.evento';
import { EVENTO_ENTRADA_TRANSFERIDA, VERSION_ENTRADA_TRANSFERIDA } from './topologia';

/**
 * Paso 13 del CU-006. Este consumidor mueve dinero, así que lo que se prueba es
 * **cuándo se niega a moverlo**.
 *
 * Un evento de la cola es un mensaje que llega por la red y que podría estar
 * repetido, retrasado o fabricado. Pagar basándose solo en lo que dice el
 * mensaje sería confiar en el mensajero; por eso el consumidor consulta la
 * transacción en la base y usa las cifras de allí.
 */
describe('ConsumidorLiquidaciones', () => {
  const TRANSACCION = '7f3c1e2a-5d4b-4c8e-9a1f-2b3c4d5e6f70';

  function evento(): EntradaTransferida {
    return {
      evento: EVENTO_ENTRADA_TRANSFERIDA,
      version: VERSION_ENTRADA_TRANSFERIDA,
      id: TRANSACCION,
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
        transaccionId: TRANSACCION,
        numeroTransaccion: 'TXN-2026-000008',
      },
      importes: {
        // A propósito distintos de los de la base: el consumidor debe usar los
        // de la base, no los del mensaje.
        precio: 999999,
        comision: 1,
        netoVendedor: 999998,
        moneda: 'COP',
        referenciaPasarela: 'pas_del_mensaje',
      },
    };
  }

  function consumidorCon(transaccion: TransaccionReventa | null) {
    const fuente = {
      manager: { findOneBy: () => Promise.resolve(transaccion) },
    } as unknown as DataSource;
    const conexion = { obtenerCanal: () => null } as unknown as ConexionRabbitMq;
    const consumidor = new ConsumidorLiquidaciones(conexion, fuente);
    return {
      liquidar: (carga: EntradaTransferida) =>
        (consumidor as unknown as { procesar(e: EntradaTransferida): Promise<void> }).procesar(carga),
    };
  }

  function transaccion(cambios: Partial<TransaccionReventa> = {}): TransaccionReventa {
    return {
      id: TRANSACCION,
      estado: EstadoTransaccion.APROBADA,
      precio: 300000,
      comision: 30000,
      netoVendedor: 270000,
      referenciaPasarela: 'pas_real',
      vendedorId: 'a0000001-0000-4000-8000-000000000001',
      numeroTransaccion: 'TXN-2026-000008',
      ...cambios,
    } as TransaccionReventa;
  }

  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('liquida con las cifras de la base, no con las del mensaje', async () => {
    const { liquidar } = consumidorCon(transaccion());

    await liquidar(evento());

    // 270000 es lo que dice la base; el mensaje traía 999998.
    expect(log).toHaveBeenCalledWith(expect.stringContaining('270000'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('999998'));
  });

  it('reintenta si la transacción todavía no existe', async () => {
    // Puede ser un evento espurio, o haber llegado antes de que la transacción
    // fuera visible. Lanzar deja que la base reintente y, si no aparece, acabe
    // en la DLQ, que es donde hay que mirar algo así.
    const { liquidar } = consumidorCon(null);

    await expect(liquidar(evento())).rejects.toThrow(/No existe la transacción/);
  });

  it.each([EstadoTransaccion.RECHAZADA, EstadoTransaccion.FALLIDA, EstadoTransaccion.PENDIENTE])(
    'no liquida una transacción %s, y no lo reintenta',
    async (estado) => {
      // Reintentar no va a cambiar el estado de una transacción rechazada, y
      // liquidar una venta que no se cobró sería regalar dinero.
      const { liquidar } = consumidorCon(transaccion({ estado }));

      await expect(liquidar(evento())).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('no APROBADA'));
      expect(log).not.toHaveBeenCalled();
    },
  );

  it('no liquida sin referencia de pasarela con la que conciliar', async () => {
    const { liquidar } = consumidorCon(transaccion({ referenciaPasarela: null }));

    await expect(liquidar(evento())).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('referencia de pasarela'));
    expect(log).not.toHaveBeenCalled();
  });
});
