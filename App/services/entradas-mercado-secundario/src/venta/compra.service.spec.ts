import { QueryFailedError } from 'typeorm';
import { baseDatosFalsa } from '../../test/dobles/base-datos';
import { ConfiguracionServicio } from '../config/configuracion';
import { Compra, EstadoCompra } from '../persistencia/entidades/compra.entity';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { HistorialPropietario, MotivoCambioPropietario } from '../persistencia/entidades/historial-propietario.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import { ProcesadorPagos, ResultadoCobro } from '../reventa/pagos/procesador-pagos';
import { GeneradorQr } from '../reventa/qr/generador-qr.service';
import { CompraService } from './compra.service';
import { Contadores } from './contadores';
import { NotificacionesVenta } from './notificaciones-venta.service';
import { PromocionesService } from './promociones.service';
import {
  CompraNoEncontrada,
  CompraNoPagable,
  EventoNoALaVenta,
  LocalidadNoEncontrada,
  PagoCompraIndeterminado,
  PagoCompraRechazado,
  ReservaVencida,
  SinDisponibilidad,
} from './venta.errors';

/**
 * CU-001: reservar y pagar. La base, la pasarela, los contadores y las
 * promociones son dobles: lo que se prueba es qué decide el servicio en cada
 * camino de la ficha. Que los UPDATE condicionales resistan la concurrencia se
 * comprobó contra Postgres real (ver README, "Evidencia").
 */
describe('CompraService — CU-001', () => {
  const ANA = 'a0000001-0000-4000-8000-000000000001';
  const config = { venta: { reservaMinutos: 10 } } as ConfiguracionServicio;
  const enUnaHora = () => new Date(Date.now() + 3_600_000);

  const localidad = (cambios: Partial<LocalidadEvento> = {}): LocalidadEvento =>
    ({ localidadId: 'loc-1', eventoId: 'evt-1', nombre: 'General', precio: 180000, aforo: 100, vendidas: 97, reservadas: 0, ...cambios }) as LocalidadEvento;
  const evento = (cambios: Partial<EventoReferencia> = {}): EventoReferencia =>
    ({ eventoId: 'evt-1', nombre: 'HEXACORE Fest', estado: EstadoEvento.PUBLICADO, fechaInicio: new Date(Date.now() + 86_400_000 * 30), ...cambios }) as EventoReferencia;
  const compra = (cambios: Partial<Compra> = {}): Compra =>
    ({
      id: 'compra-1',
      numeroCompra: 'CMP-2026-000001',
      compradorId: ANA,
      eventoId: 'evt-1',
      localidadId: 'loc-1',
      cantidad: 2,
      precioUnitario: 180000,
      subtotal: 360000,
      descuento: 36000,
      total: 324000,
      codigoPromocional: 'HEXA10',
      estado: EstadoCompra.PENDIENTE,
      intentosRechazados: 0,
      referenciaPasarela: null,
      motivo: null,
      expiraEn: enUnaHora(),
      pagadaEn: null,
      ...cambios,
    }) as Compra;

  function construir() {
    const { gestor, fuenteDatos } = baseDatosFalsa();
    const contadores = {
      reservarCupo: jest.fn().mockResolvedValue(true),
      confirmarCupo: jest.fn().mockResolvedValue(true),
      liberarReserva: jest.fn().mockResolvedValue(true),
    };
    const promociones = { confirmarUso: jest.fn(), liberarUso: jest.fn() };
    const pagos = { cobrar: jest.fn(), reembolsar: jest.fn() };
    const notificaciones = { publicar: jest.fn().mockResolvedValue(true) };
    let n = 0;
    const qr = { emitir: jest.fn(() => `HXC-QR-${++n}`) };
    const servicio = new CompraService(
      fuenteDatos,
      contadores as unknown as Contadores,
      promociones as unknown as PromocionesService,
      qr as unknown as GeneradorQr,
      notificaciones as unknown as NotificacionesVenta,
      pagos as unknown as ProcesadorPagos,
      config,
    );
    return { servicio, gestor, contadores, promociones, pagos, notificaciones, qr };
  }

  /** Programa `findOne` según la entidad que se pida. */
  function responder(gestor: ReturnType<typeof construir>['gestor'], datos: Map<unknown, unknown>) {
    gestor.findOne.mockImplementation((entidad: unknown) => Promise.resolve(datos.get(entidad) ?? null));
  }

  describe('reservar (pasos 3-4)', () => {
    it('aparta el cupo, calcula el total y da un plazo para pagar', async () => {
      const { servicio, gestor, contadores } = construir();
      responder(gestor, new Map<unknown, unknown>([[LocalidadEvento, localidad()], [EventoReferencia, evento()]]));

      const resultado = await servicio.reservar(ANA, { localidadId: 'loc-1', cantidad: 2 });

      expect(contadores.reservarCupo).toHaveBeenCalledWith(gestor, 'loc-1', 2);
      expect(resultado).toMatchObject({ estado: EstadoCompra.PENDIENTE, subtotal: 360000, total: 360000, numeroCompra: 'CMP-2026-000001' });
      const minutos = (new Date(resultado.expiraEn).getTime() - Date.now()) / 60_000;
      expect(minutos).toBeGreaterThan(9.9);
      expect(minutos).toBeLessThanOrEqual(10);
    });

    it('CU-001A: sin cupo, informa cuántos quedan y no crea la compra', async () => {
      const { servicio, gestor, contadores } = construir();
      responder(gestor, new Map<unknown, unknown>([[LocalidadEvento, localidad({ vendidas: 97 })], [EventoReferencia, evento()]]));
      contadores.reservarCupo.mockResolvedValue(false);

      await expect(servicio.reservar(ANA, { localidadId: 'loc-1', cantidad: 4 })).rejects.toThrow(SinDisponibilidad);
      expect(gestor.save).not.toHaveBeenCalled();
    });

    it('rechaza una localidad que no existe', async () => {
      const { servicio } = construir();
      await expect(servicio.reservar(ANA, { localidadId: 'nada', cantidad: 1 })).rejects.toThrow(LocalidadNoEncontrada);
    });

    it.each([
      ['un borrador', evento({ estado: EstadoEvento.BORRADOR })],
      ['un evento que ya empezó', evento({ fechaInicio: new Date(Date.now() - 1000) })],
    ])('no vende entradas de %s', async (_caso, dado) => {
      const { servicio, gestor, contadores } = construir();
      responder(gestor, new Map<unknown, unknown>([[LocalidadEvento, localidad()], [EventoReferencia, dado]]));

      await expect(servicio.reservar(ANA, { localidadId: 'loc-1', cantidad: 1 })).rejects.toThrow(EventoNoALaVenta);
      expect(contadores.reservarCupo).not.toHaveBeenCalled();
    });
  });

  describe('pagar (pasos 5-8)', () => {
    it('con el cobro aprobado: vende el cupo, confirma el cupón, emite un QR por entrada y notifica', async () => {
      const { servicio, gestor, contadores, promociones, pagos, notificaciones } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra()], [LocalidadEvento, localidad()], [EventoReferencia, evento()]]));
      pagos.cobrar.mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_1', motivo: null });

      const resultado = await servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 'tok_ok' });

      expect(pagos.cobrar).toHaveBeenCalledWith(expect.objectContaining({ monto: 324000, token: 'tok_ok', claveIdempotencia: 'compra-1:0' }));
      expect(contadores.confirmarCupo).toHaveBeenCalledWith(gestor, 'loc-1', 2);
      expect(promociones.confirmarUso).toHaveBeenCalledWith(gestor, 'compra-1');
      expect(resultado.estado).toBe(EstadoCompra.PAGADA);
      expect(resultado.entradas.map((e) => e.codigoQr)).toEqual(['HXC-QR-1', 'HXC-QR-2']);
      // El descuento se reparte: cada entrada guarda lo que de verdad se pagó.
      expect(resultado.entradas.map((e) => e.precioPagado)).toEqual([162000, 162000]);
      // Cada entrada nace con su fila de EMISION en el historial del CU-006.
      const emisiones = gestor.insert.mock.calls.filter(([entidad]) => entidad === HistorialPropietario);
      expect(emisiones).toHaveLength(2);
      expect(emisiones[0][1]).toMatchObject({ motivo: MotivoCambioPropietario.EMISION, propietarioAnteriorId: null });
      expect(notificaciones.publicar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'COMPRA_CONFIRMADA' }));
    });

    it('marca la compra PAGANDO antes de cobrar, para que el barrido no la venza con el cobro en vuelo', async () => {
      const { servicio, gestor, pagos } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra()]]));
      const orden: string[] = [];
      gestor.update.mockImplementation((_e: unknown, _c: unknown, cambios: { estado?: string }) => {
        orden.push(`update:${cambios.estado}`);
        return Promise.resolve({ affected: 1 });
      });
      pagos.cobrar.mockImplementation(() => {
        orden.push('cobrar');
        return Promise.resolve({ resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'no' });
      });

      await expect(servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 't' })).rejects.toThrow();
      expect(orden.slice(0, 2)).toEqual([`update:${EstadoCompra.PAGANDO}`, 'cobrar']);
    });

    it('CU-001C: con el cobro rechazado, la reserva sigue viva y el siguiente intento usa otra clave', async () => {
      const { servicio, gestor, pagos } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra()]]));
      pagos.cobrar.mockResolvedValue({ resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'Fondos insuficientes' });

      await expect(servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 'tok_rechazo' })).rejects.toThrow(PagoCompraRechazado);
      expect(gestor.update).toHaveBeenCalledWith(
        Compra,
        { id: 'compra-1', estado: EstadoCompra.PAGANDO },
        expect.objectContaining({ estado: EstadoCompra.PENDIENTE, intentosRechazados: 1 }),
      );
    });

    it('sin respuesta de la pasarela: la compra se queda PAGANDO y no emite nada', async () => {
      const { servicio, gestor, pagos, qr } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra()]]));
      pagos.cobrar.mockResolvedValue({ resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'timeout' });

      await expect(servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 'tok_timeout' })).rejects.toThrow(PagoCompraIndeterminado);
      expect(qr.emitir).not.toHaveBeenCalled();
      expect(gestor.update).not.toHaveBeenCalledWith(Compra, expect.anything(), expect.objectContaining({ estado: EstadoCompra.PENDIENTE }));
    });

    it('CU-001B: si la reserva venció, la libera y no cobra', async () => {
      const { servicio, gestor, pagos, contadores, promociones } = construir();
      const vencida = compra({ expiraEn: new Date(Date.now() - 1000) });
      responder(gestor, new Map<unknown, unknown>([[Compra, vencida]]));

      await expect(servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 't' })).rejects.toThrow(ReservaVencida);
      expect(pagos.cobrar).not.toHaveBeenCalled();
      expect(contadores.liberarReserva).toHaveBeenCalledWith(gestor, 'loc-1', 2);
      expect(promociones.liberarUso).toHaveBeenCalledWith(gestor, vencida);
    });

    it.each([EstadoCompra.PAGADA, EstadoCompra.CANCELADA])('no admite pagar una compra %s', async (estado) => {
      const { servicio, gestor, pagos } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra({ estado })]]));

      await expect(servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 't' })).rejects.toThrow(CompraNoPagable);
      expect(pagos.cobrar).not.toHaveBeenCalled();
    });

    it('una compra de otra persona no existe para quien paga', async () => {
      const { servicio } = construir();
      await expect(servicio.pagar(ANA, 'ajena', { metodoPago: 'TARJETA', token: 't' })).rejects.toThrow(CompraNoEncontrada);
    });

    it('CU-001D: si un QR choca con uno existente, alerta y reintenta con códigos nuevos', async () => {
      const { servicio, gestor, pagos, qr } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra({ cantidad: 1, total: 180000 })], [LocalidadEvento, localidad()], [EventoReferencia, evento()]]));
      pagos.cobrar.mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_1', motivo: null });
      const colision = new QueryFailedError('INSERT', [], Object.assign(new Error('duplicado'), { constraint: 'uq_entradas_codigo_qr' }));
      gestor.save.mockRejectedValueOnce(colision);

      const resultado = await servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 'tok_ok' });

      expect(qr.emitir).toHaveBeenCalledTimes(2);
      expect(resultado.estado).toBe(EstadoCompra.PAGADA);
    });

    it('si otra petición ya emitió las entradas (doble clic), devuelve la compra sin emitir otra vez', async () => {
      const { servicio, gestor, pagos, qr } = construir();
      responder(gestor, new Map<unknown, unknown>([[Compra, compra()]]));
      pagos.cobrar.mockResolvedValue({ resultado: ResultadoCobro.APROBADO, referencia: 'pas_1', motivo: null });
      // Primer update: PENDIENTE → PAGANDO. Segundo: PAGANDO → PAGADA, que ya hizo la otra petición.
      gestor.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });

      await servicio.pagar(ANA, 'compra-1', { metodoPago: 'TARJETA', token: 'tok_ok' });

      expect(qr.emitir).not.toHaveBeenCalled();
    });
  });

  describe('barrido de reservas vencidas (CU-001B)', () => {
    it('libera cupo y cupón de cada reserva vencida', async () => {
      const { servicio, gestor, contadores, promociones } = construir();
      gestor.find.mockResolvedValue([compra(), compra({ id: 'compra-2', localidadId: 'loc-2', cantidad: 1 })]);

      expect(await servicio.expirarVencidas()).toBe(2);
      expect(contadores.liberarReserva).toHaveBeenCalledWith(gestor, 'loc-2', 1);
      expect(promociones.liberarUso).toHaveBeenCalledTimes(2);
    });

    it('no toca una compra que entretanto pasó a PAGANDO', async () => {
      const { servicio, gestor, contadores } = construir();
      gestor.find.mockResolvedValue([compra()]);
      gestor.update.mockResolvedValue({ affected: 0 });

      expect(await servicio.expirarVencidas()).toBe(0);
      expect(contadores.liberarReserva).not.toHaveBeenCalled();
    });
  });

  it('el detalle solo muestra las entradas que siguen siendo del comprador', async () => {
    const { servicio, gestor } = construir();
    responder(gestor, new Map<unknown, unknown>([[Compra, compra({ estado: EstadoCompra.PAGADA })]]));

    await servicio.detalle(ANA, 'compra-1');

    expect(gestor.find).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: { compraId: 'compra-1', propietarioId: ANA } }));
  });

  it('lista las compras del usuario', async () => {
    const { servicio, gestor } = construir();
    gestor.find.mockResolvedValue([compra()]);

    const lista = await servicio.listar(ANA);

    expect(lista).toHaveLength(1);
    expect(gestor.find).toHaveBeenCalledWith(Compra, expect.objectContaining({ where: { compradorId: ANA } }));
  });
});
