import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfiguracionServicio } from '../config/configuracion';
import { ClienteVentas } from './cliente-ventas.service';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import { EstadoTransaccion, TransaccionReventa } from '../persistencia/entidades/transaccion-reventa.entity';
import { CheckoutService } from './checkout.service';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { PublicadorEventos } from './eventos/publicador-eventos.service';
import { ProcesadorPagos, ResultadoCobro } from './pagos/procesador-pagos';
import { GeneradorQr } from './qr/generador-qr.service';

/**
 * El checkout es donde se cruzan el bloqueo distribuido, el cobro y la
 * transferencia, y donde un error tiene consecuencias irreversibles: una doble
 * venta o un cobro sin entrega.
 *
 * Estas pruebas se centran en **qué se hace con el bloqueo** en cada desenlace,
 * que es lo que decide si la publicación vuelve al mercado o queda retenida:
 *
 * - pago aprobado  -> se libera **después** de confirmar en la base;
 * - pago rechazado -> se libera ya (se sabe que no hubo cargo);
 * - sin respuesta  -> **no** se libera (no se sabe si hubo cargo).
 *
 * Todas las dependencias externas están sustituidas por dobles (RNF-18). El
 * comportamiento contra infraestructura real está en `pruebas/`.
 */
describe('CheckoutService', () => {
  const COMPRADOR = 'b0000001-0000-4000-8000-000000000001';
  const VENDEDOR = 'a0000001-0000-4000-8000-000000000001';
  const PUBLICACION = '30000000-0000-4000-8000-000000000001';
  const CHECKOUT = '40000000-0000-4000-8000-000000000001';

  const config = {
    reventa: { comisionPorcentaje: 10, topePrecioFactor: 1.5, bloqueoTtlSegundos: 120, margenCierreMinutos: 0 },
  } as ConfiguracionServicio;

  const ENTRADA = '20000000-0000-4000-8000-000000000001';
  const EVENTO = 'e0000001-0000-4000-8000-000000000001';

  /**
   * Doble del cliente de Ventas.
   *
   * `transferida` y `respondio` se separan a propósito: es la distinción que
   * decide si la publicación se reabre o se deja cerrada, y es lo único que
   * Postventa puede saber de la transferencia.
   */
  function ventasCon(resultado: { transferida?: boolean; respondio?: boolean } = {}) {
    const transferir = jest.fn().mockResolvedValue({
      transferida: resultado.transferida ?? true,
      qrAnterior: 'HXC-QR-viejo',
      respondio: resultado.respondio ?? true,
    });
    const devolverDeReventa = jest.fn().mockResolvedValue(true);
    return {
      cliente: { transferir, devolverDeReventa, comoServicio: () => 'servicio' } as unknown as ClienteVentas,
      transferir,
    };
  }

  function publicacion(cambios: Partial<PublicacionReventa> = {}): PublicacionReventa {
    return {
      id: PUBLICACION,
      entradaId: ENTRADA,
      vendedorId: VENDEDOR,
      precio: 300000,
      precioOriginal: 250000,
      eventoId: EVENTO,
      numeroTicket: 'TCK-2026-000001',
      localidadNombre: 'General',
      estado: EstadoPublicacion.ACTIVA,
      fechaExpiracion: new Date(Date.now() + 86_400_000),
      fechaPublicacion: new Date(),
      ...cambios,
    } as PublicacionReventa;
  }

  function evento(): EventoReferencia {
    return {
      eventoId: EVENTO,
      nombre: 'HEXACORE Fest 2026',
      lugar: 'Movistar Arena',
      ciudad: 'Bogotá',
      fechaInicio: new Date(Date.now() + 86_400_000),
      permiteReventa: true,
    } as EventoReferencia;
  }

  function transaccion(cambios: Partial<TransaccionReventa> = {}): TransaccionReventa {
    return {
      id: CHECKOUT,
      publicacionId: PUBLICACION,
      entradaId: ENTRADA,
      compradorId: COMPRADOR,
      vendedorId: VENDEDOR,
      precio: 300000,
      comision: 30000,
      netoVendedor: 270000,
      estado: EstadoTransaccion.PENDIENTE,
      referenciaPasarela: null,
      motivo: null,
      numeroTransaccion: 'TXN-2026-000001',
      ...cambios,
    } as TransaccionReventa;
  }

  /** Doble de la base: devuelve la entidad que se le pida según su tipo. */
  function fuenteDatos(porTipo: Map<unknown, unknown>, seguimiento: { update: jest.Mock; insert: jest.Mock }) {
    const buscar = (entidad: unknown) => Promise.resolve(porTipo.get(entidad) ?? null);
    const gestor = {
      findOneBy: (entidad: unknown) => buscar(entidad),
      findOneByOrFail: (entidad: unknown) => buscar(entidad),
      save: jest.fn((e: unknown) => Promise.resolve(e)),
      update: seguimiento.update,
      insert: seguimiento.insert,
      create: (_entidad: unknown, datos: unknown) => datos,
      query: () => Promise.resolve([{ valor: '1' }]),
      transaction: (trabajo: (tx: unknown) => Promise<unknown>) => trabajo(gestor),
    };
    return {
      manager: gestor,
      transaction: (trabajo: (tx: unknown) => Promise<unknown>) => trabajo(gestor),
    } as unknown as DataSource;
  }

  function construir(opciones: {
    resultadoCobro: ResultadoCobro;
    referencia?: string | null;
    transaccionActual?: TransaccionReventa;
    publicacionActual?: PublicacionReventa;
    transferencia?: { transferida?: boolean; respondio?: boolean };
  }) {
    const seguimiento = { update: jest.fn().mockResolvedValue({ affected: 1 }), insert: jest.fn() };
    const porTipo = new Map<unknown, unknown>([
      [PublicacionReventa, opciones.publicacionActual ?? publicacion()],
      [EventoReferencia, evento()],
      [TransaccionReventa, opciones.transaccionActual ?? transaccion()],
    ]);

    const concurrencia = {
      bloquear: jest.fn().mockResolvedValue({ adquirido: true, titularActual: 'x' }),
      liberar: jest.fn().mockResolvedValue(true),
      renovar: jest.fn().mockResolvedValue(true),
      // Por defecto el bloqueo es de este checkout, que es el caso normal. Las
      // pruebas que simulan una reserva perdida lo cambian a false.
      esTitular: jest.fn().mockResolvedValue(true),
      tiempoRestanteMs: jest.fn().mockResolvedValue(90_000),
    } as unknown as GestorConcurrencia;

    const pagos = {
      cobrar: jest.fn().mockResolvedValue({
        resultado: opciones.resultadoCobro,
        referencia: opciones.referencia ?? (opciones.resultadoCobro === ResultadoCobro.APROBADO ? 'pas_abc' : null),
        motivo: opciones.resultadoCobro === ResultadoCobro.RECHAZADO ? 'Fondos insuficientes' : null,
      }),
    } as unknown as ProcesadorPagos;

    const publicador = { publicarEntradaTransferida: jest.fn().mockResolvedValue(true) } as unknown as PublicadorEventos;

    const ventas = ventasCon(opciones.transferencia);

    const servicio = new CheckoutService(
      fuenteDatos(porTipo, seguimiento),
      ventas.cliente,
      concurrencia,
      new GeneradorQr(),
      publicador,
      pagos,
      config,
    );

    return { servicio, concurrencia, pagos, publicador, seguimiento, ventas };
  }

  beforeEach(() => {
    for (const nivel of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(Logger.prototype, nivel).mockImplementation();
    }
  });

  afterEach(() => jest.restoreAllMocks());

  describe('pago aprobado (pasos 7-11)', () => {
    it('pide la transferencia a Ventas con un QR nuevo', async () => {
      // Desde ADR-14 el cambio de dueño, el QR nuevo y la fila de historial los
      // hace Ventas en UNA transacción suya — es donde viven RNF-02 (nunca dos
      // códigos válidos) y RNF-11, y se prueban en sus pruebas. Lo que le toca
      // a Postventa, y es lo que se comprueba aquí, es **pedirlo bien**: con
      // quién compra, quién vende, qué transacción lo respalda y un QR nuevo.
      const { servicio, ventas } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      const resultado = await servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba');

      expect(resultado.transferida).toBe(true);
      const [datos] = ventas.transferir.mock.calls[0] as [
        { entradaId: string; compradorId: string; vendedorId: string; transaccionId: string; codigoQrNuevo: string },
      ];
      expect(datos.entradaId).toBe(ENTRADA);
      expect(datos.compradorId).toBe(COMPRADOR);
      expect(datos.vendedorId).toBe(VENDEDOR);
      expect(datos.transaccionId).toBe(CHECKOUT);
      expect(datos.codigoQrNuevo).not.toBe('HXC-QR-viejo');
      // El comprobante tiene que llevar el QR que de verdad se instaló.
      expect(resultado.codigoQr).toBe(datos.codigoQrNuevo);
    });

    it('cierra la publicación ANTES de pedir la transferencia', async () => {
      // El UPDATE condicionado a ACTIVA es lo que decide la carrera entre dos
      // compradores: si fuera después de transferir, los dos podrían pasar.
      const orden: string[] = [];
      const { servicio, seguimiento, ventas } = construir({ resultadoCobro: ResultadoCobro.APROBADO });
      seguimiento.update.mockImplementation((entidad: unknown) => {
        if (entidad === PublicacionReventa) orden.push('cerrar-publicacion');
        return Promise.resolve({ affected: 1 });
      });
      ventas.transferir.mockImplementation(() => {
        orden.push('transferir');
        return Promise.resolve({ transferida: true, qrAnterior: 'HXC-QR-viejo', respondio: true });
      });

      await servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba');

      expect(orden.indexOf('cerrar-publicacion')).toBeLessThan(orden.indexOf('transferir'));
    });

    it('marca la publicación como vendida con su comprador', async () => {
      const { servicio, seguimiento } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      await servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba');

      const [, , cambios] = seguimiento.update.mock.calls.find((c) => c[0] === PublicacionReventa) as [
        unknown,
        unknown,
        { estado: EstadoPublicacion; compradorId: string },
      ];
      expect(cambios.estado).toBe(EstadoPublicacion.VENDIDA);
      expect(cambios.compradorId).toBe(COMPRADOR);
    });

    it('libera el bloqueo y publica el evento', async () => {
      const { servicio, concurrencia, publicador } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      await servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba');

      expect(concurrencia.liberar).toHaveBeenCalledWith(PUBLICACION, CHECKOUT);
      expect(publicador.publicarEntradaTransferida).toHaveBeenCalledTimes(1);
    });

    it('renueva el bloqueo antes de cobrar', async () => {
      // Si quedaban pocos segundos, el cobro podría terminar con la reserva ya
      // vencida y la publicación en manos de otro comprador.
      const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      await servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba');

      expect(concurrencia.renovar).toHaveBeenCalledWith(PUBLICACION, CHECKOUT);
    });

    it('cobra con el id de la transacción como clave de idempotencia', async () => {
      const { servicio, pagos } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      await servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba');

      const solicitud = (pagos.cobrar as jest.Mock).mock.calls[0][0] as { claveIdempotencia: string; token: string };
      expect(solicitud.claveIdempotencia).toBe(CHECKOUT);
      expect(solicitud.token).toBe('tok_ok');
    });
  });

  describe('la reserva debe seguir siendo de quien paga', () => {
    it('rechaza pagar si el bloqueo ya es de otro comprador', async () => {
      // El fallo que esto fija: `exigirVigente` preguntaba si EXISTÍA un
      // bloqueo, no si era nuestro. Con el TTL vencido y otro comprador dentro,
      // seguía habiendo bloqueo —el suyo— y el pago pasaba.
      const { servicio, concurrencia, pagos } = construir({ resultadoCobro: ResultadoCobro.APROBADO });
      (concurrencia.esTitular as jest.Mock).mockResolvedValue(false);

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'CHECKOUT_NO_VIGENTE' } });

      // Y sobre todo: no se llega a cobrar.
      expect(pagos.cobrar).not.toHaveBeenCalled();
    });

    it('rechaza pagar si el bloqueo se pierde justo antes de cobrar', async () => {
      // `renovar` devuelve false cuando el bloqueo ya no es nuestro. Descartar
      // ese valor dejaba llegar hasta la pasarela a un checkout sin reserva.
      const { servicio, concurrencia, pagos } = construir({ resultadoCobro: ResultadoCobro.APROBADO });
      (concurrencia.renovar as jest.Mock).mockResolvedValue(false);

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'CHECKOUT_NO_VIGENTE' } });
      expect(pagos.cobrar).not.toHaveBeenCalled();
    });

    it('avisa de que se cobró si otro completó la transferencia primero', async () => {
      // Carrera que se cuela entre las dos comprobaciones: el UPDATE
      // condicional no afecta a ninguna fila. El comprador YA pagó, así que el
      // mensaje tiene que decírselo en vez de un 409 genérico.
      const { servicio, seguimiento } = construir({ resultadoCobro: ResultadoCobro.APROBADO });
      seguimiento.update.mockResolvedValue({ affected: 0 });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({
        response: { codigo: 'COBRADO_SIN_TRANSFERIR', requiereConciliacion: true },
      });
    });
  });

  describe('CU-006G — pago rechazado', () => {
    it('falla con el código del camino y libera el bloqueo', async () => {
      const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.RECHAZADO });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_rechazo' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'CU-006G' } });

      // Se sabe que no hubo cargo: la publicación vuelve al mercado ya, en vez
      // de quedar reservada hasta que caduque el TTL.
      expect(concurrencia.liberar).toHaveBeenCalledWith(PUBLICACION, CHECKOUT);
    });

    it('no transfiere nada', async () => {
      const { servicio, ventas } = construir({ resultadoCobro: ResultadoCobro.RECHAZADO });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_rechazo' }, 'tok-prueba'),
      ).rejects.toThrow();

      expect(ventas.transferir).not.toHaveBeenCalled();
    });
  });

  describe('cobrado, pero la transferencia no salió', () => {
    it('reabre la publicación si Ventas dijo que NO transfirió', async () => {
      // Ventas respondió: se sabe que no transfirió nada, así que reabrir el
      // anuncio es seguro. Es la compensación que sustituye al rollback que
      // antes era gratis.
      const { servicio, seguimiento } = construir({
        resultadoCobro: ResultadoCobro.APROBADO,
        transferencia: { transferida: false, respondio: true },
      });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'COBRADO_SIN_TRANSFERIR' } });

      const reapertura = seguimiento.update.mock.calls.find(
        (c) => c[0] === PublicacionReventa && (c[2] as { estado?: string })?.estado === EstadoPublicacion.ACTIVA,
      );
      expect(reapertura).toBeDefined();
      expect(reapertura?.[2]).toMatchObject({ compradorId: null, fechaCierre: null });
    });

    it('deja la publicación CERRADA si Ventas no respondió', async () => {
      // Esta es la decisión que más importa de toda la Saga. No se sabe si
      // transfirió: reabrir podría venderla dos veces, y una entrada vendida
      // dos veces no se arregla. Una bloqueada, sí.
      const { servicio, seguimiento } = construir({
        resultadoCobro: ResultadoCobro.APROBADO,
        transferencia: { transferida: false, respondio: false },
      });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'COBRADO_SIN_TRANSFERIR', requiereConciliacion: true } });

      const reapertura = seguimiento.update.mock.calls.find(
        (c) => c[0] === PublicacionReventa && (c[2] as { estado?: string })?.estado === EstadoPublicacion.ACTIVA,
      );
      expect(reapertura).toBeUndefined();
    });

    it('no publica el evento de transferencia si no hubo transferencia', async () => {
      const { servicio, publicador } = construir({
        resultadoCobro: ResultadoCobro.APROBADO,
        transferencia: { transferida: false, respondio: true },
      });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toThrow();

      expect(publicador.publicarEntradaTransferida).not.toHaveBeenCalled();
    });
  });

  describe('CU-006I — no se sabe si se cobró', () => {
    it('falla con el código del camino y NO libera el bloqueo', async () => {
      const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.INDETERMINADO });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_timeout' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'CU-006I', requiereConciliacion: true } });

      // Esta es la diferencia con CU-006G y la razón de que existan tres
      // resultados de cobro: dejar entrar a otro comprador podría acabar en dos
      // cobros por una sola entrada.
      expect(concurrencia.liberar).not.toHaveBeenCalled();
    });

    it('no publica el evento de transferencia', async () => {
      const { servicio, publicador } = construir({ resultadoCobro: ResultadoCobro.INDETERMINADO });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_timeout' }, 'tok-prueba'),
      ).rejects.toThrow();

      expect(publicador.publicarEntradaTransferida).not.toHaveBeenCalled();
    });
  });

  describe('validaciones antes de cobrar', () => {
    it('rechaza un checkout que no es del solicitante', async () => {
      const { servicio, pagos } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      // Se responde como si no existiera: decir "existe pero no es tuyo"
      // confirmaría a un desconocido que ese identificador es real.
      await expect(
        servicio.pagar('otro-comprador', CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'CHECKOUT_NO_ENCONTRADO' } });
      expect(pagos.cobrar).not.toHaveBeenCalled();
    });

    it.each([EstadoTransaccion.APROBADA, EstadoTransaccion.CANCELADA, EstadoTransaccion.RECHAZADA])(
      'rechaza pagar un checkout ya %s',
      async (estado) => {
        const { servicio, pagos } = construir({
          resultadoCobro: ResultadoCobro.APROBADO,
          transaccionActual: transaccion({ estado }),
        });

        await expect(
          servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
        ).rejects.toMatchObject({ response: { codigo: 'CHECKOUT_NO_VIGENTE' } });
        expect(pagos.cobrar).not.toHaveBeenCalled();
      },
    );

    it('rechaza si la publicación ya no está activa', async () => {
      const { servicio, pagos } = construir({
        resultadoCobro: ResultadoCobro.APROBADO,
        publicacionActual: publicacion({ estado: EstadoPublicacion.VENDIDA }),
      });

      await expect(
        servicio.pagar(COMPRADOR, CHECKOUT, { metodoPago: 'TARJETA', token: 'tok_ok' }, 'tok-prueba'),
      ).rejects.toMatchObject({ response: { codigo: 'PUBLICACION_NO_ACTIVA' } });
      expect(pagos.cobrar).not.toHaveBeenCalled();
    });
  });

  describe('iniciar el checkout (paso 6)', () => {
    it('reserva la publicación y reparte el precio', async () => {
      const { servicio } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      const checkout = await servicio.iniciar(COMPRADOR, PUBLICACION);

      expect(checkout.precio).toBe(300000);
      expect(checkout.comision).toBe(30000);
      expect(checkout.netoVendedor).toBe(270000);
      // La restricción CHECK de la base exige que cuadre al centavo.
      expect(checkout.comision + checkout.netoVendedor).toBe(checkout.precio);
    });

    it('no deja comprar su propia entrada al vendedor', async () => {
      const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      await expect(servicio.iniciar(VENDEDOR, PUBLICACION)).rejects.toMatchObject({
        response: { codigo: 'VENDEDOR_ES_COMPRADOR' },
      });
      // Se valida antes de bloquear, para no dejar un bloqueo puesto sobre algo
      // que se iba a rechazar de todos modos.
      expect(concurrencia.bloquear).not.toHaveBeenCalled();
    });

    it('rechaza una publicación cuya ventana ya se cerró', async () => {
      const { servicio } = construir({
        resultadoCobro: ResultadoCobro.APROBADO,
        publicacionActual: publicacion({ fechaExpiracion: new Date(Date.now() - 1000) }),
      });

      await expect(servicio.iniciar(COMPRADOR, PUBLICACION)).rejects.toMatchObject({
        response: { codigo: 'CU-006D' },
      });
    });

    it('CU-006H: rechaza de inmediato si otra persona la está comprando', async () => {
      const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.APROBADO });
      (concurrencia.bloquear as jest.Mock).mockResolvedValue({ adquirido: false, titularActual: null });

      await expect(servicio.iniciar(COMPRADOR, PUBLICACION)).rejects.toMatchObject({
        response: { codigo: 'CU-006H' },
      });
    });
  });

  describe('CU-006C — cancelar', () => {
    it('marca la transacción como cancelada y libera el bloqueo', async () => {
      const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.APROBADO });

      const resultado = await servicio.cancelar(COMPRADOR, CHECKOUT);

      expect(resultado.estado).toBe(EstadoTransaccion.CANCELADA);
      // Liberar al instante devuelve la entrada al mercado sin esperar al TTL.
      expect(concurrencia.liberar).toHaveBeenCalledWith(PUBLICACION, CHECKOUT);
    });

    it('no deja cancelar dos veces', async () => {
      const { servicio } = construir({
        resultadoCobro: ResultadoCobro.APROBADO,
        transaccionActual: transaccion({ estado: EstadoTransaccion.CANCELADA }),
      });

      await expect(servicio.cancelar(COMPRADOR, CHECKOUT)).rejects.toMatchObject({
        response: { codigo: 'CHECKOUT_NO_VIGENTE' },
      });
    });
  });

  it('consultar devuelve los segundos que quedan según Redis, no según la fecha de creación', async () => {
    // El TTL de Redis es lo que manda: si el bloqueo se perdió por un reinicio
    // del broker, aquí se ve en el acto.
    const { servicio, concurrencia } = construir({ resultadoCobro: ResultadoCobro.APROBADO });
    (concurrencia.tiempoRestanteMs as jest.Mock).mockResolvedValue(30_000);

    const checkout = await servicio.consultar(COMPRADOR, CHECKOUT);

    expect(checkout.segundosRestantes).toBe(30);
  });
});
