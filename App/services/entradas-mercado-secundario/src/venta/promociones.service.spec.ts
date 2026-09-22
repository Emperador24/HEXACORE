import { baseDatosFalsa } from '../../test/dobles/base-datos';
import { CodigoPromocional } from '../persistencia/entidades/codigo-promocional.entity';
import { Compra, EstadoCompra } from '../persistencia/entidades/compra.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { EstadoUsoPromocion, UsoPromocion } from '../persistencia/entidades/uso-promocion.entity';
import { Contadores } from './contadores';
import { PromocionesService } from './promociones.service';
import {
  CompraNoAdmiteCupon,
  CompraYaTieneCupon,
  CuponAgotado,
  CuponInvalido,
  CuponNoAplica,
  ReservaVencida,
} from './venta.errors';

/** CU-004: aplicar y quitar un código promocional sobre una compra en curso. */
describe('PromocionesService — CU-004', () => {
  const ANA = 'a0000001-0000-4000-8000-000000000001';

  const compra = (cambios: Partial<Compra> = {}): Compra =>
    ({
      id: 'compra-1',
      numeroCompra: 'CMP-1',
      compradorId: ANA,
      eventoId: 'evt-1',
      localidadId: 'loc-1',
      cantidad: 2,
      precioUnitario: 180000,
      subtotal: 360000,
      descuento: 0,
      total: 360000,
      codigoPromocional: null,
      estado: EstadoCompra.PENDIENTE,
      expiraEn: new Date(Date.now() + 600_000),
      pagadaEn: null,
      ...cambios,
    }) as Compra;
  const cupon = (cambios: Partial<CodigoPromocional> = {}): CodigoPromocional =>
    ({
      codigo: 'HEXA10',
      porcentaje: 10,
      eventoId: null,
      localidadId: null,
      vigenteDesde: new Date(Date.now() - 86_400_000),
      vigenteHasta: new Date(Date.now() + 86_400_000),
      limiteUsos: 100,
      usos: 0,
      activo: true,
      ...cambios,
    }) as CodigoPromocional;

  function construir(dadaCompra: Compra | null, dadoCupon: CodigoPromocional | null) {
    const { gestor, fuenteDatos } = baseDatosFalsa();
    gestor.findOne.mockImplementation((entidad: unknown) => {
      if (entidad === Compra) return Promise.resolve(dadaCompra);
      if (entidad === CodigoPromocional) return Promise.resolve(dadoCupon);
      if (entidad === EventoReferencia) return Promise.resolve({ nombre: 'Noche de Rock' });
      return Promise.resolve(null);
    });
    const contadores = { ocuparUsoCupon: jest.fn().mockResolvedValue(true), liberarUsoCupon: jest.fn().mockResolvedValue(true) };
    const servicio = new PromocionesService(fuenteDatos, contadores as unknown as Contadores);
    return { servicio, gestor, contadores };
  }

  describe('aplicar (pasos 1-8)', () => {
    it('reserva un uso, recalcula el total en el servidor y registra el uso del usuario', async () => {
      const { servicio, gestor, contadores } = construir(compra(), cupon());

      const resultado = await servicio.aplicar(ANA, 'compra-1', ' hexa10 ');

      expect(contadores.ocuparUsoCupon).toHaveBeenCalledWith(gestor, 'HEXA10');
      expect(resultado).toMatchObject({ subtotal: 360000, descuento: 36000, total: 324000, codigoPromocional: 'HEXA10' });
      expect(gestor.insert).toHaveBeenCalledWith(UsoPromocion, expect.objectContaining({ usuarioId: ANA, estado: EstadoUsoPromocion.RESERVADO, descuento: 36000 }));
    });

    it('CU-004C: código inexistente, precio sin cambios', async () => {
      const { servicio, gestor, contadores } = construir(compra(), null);

      await expect(servicio.aplicar(ANA, 'compra-1', 'NOEXISTE')).rejects.toThrow(CuponInvalido);
      expect(contadores.ocuparUsoCupon).not.toHaveBeenCalled();
      expect(gestor.update).not.toHaveBeenCalled();
    });

    it('CU-004A: informa a qué evento aplica', async () => {
      const { servicio } = construir(compra(), cupon({ eventoId: 'otro-evento' }));

      await expect(servicio.aplicar(ANA, 'compra-1', 'ROCK20')).rejects.toMatchObject({
        response: { codigo: 'CU-004A', aplicaA: 'el evento Noche de Rock' },
      });
      expect(CuponNoAplica).toBeDefined();
    });

    it('CU-004D: la lectura dice que quedan usos, pero otro tomó el último: el UPDATE decide', async () => {
      const { servicio, gestor, contadores } = construir(compra(), cupon({ limiteUsos: 1, usos: 0 }));
      contadores.ocuparUsoCupon.mockResolvedValue(false);

      await expect(servicio.aplicar(ANA, 'compra-1', 'ULTIMO')).rejects.toThrow(CuponAgotado);
      expect(gestor.update).not.toHaveBeenCalled();
    });

    it('CU-004D: sin usos, ni siquiera lo intenta', async () => {
      const { servicio, contadores } = construir(compra(), cupon({ limiteUsos: 1, usos: 1 }));

      await expect(servicio.aplicar(ANA, 'compra-1', 'ULTIMO')).rejects.toThrow(CuponAgotado);
      expect(contadores.ocuparUsoCupon).not.toHaveBeenCalled();
    });

    it('no apila descuentos: un segundo código se rechaza', async () => {
      const { servicio } = construir(compra({ codigoPromocional: 'HEXA10' }), cupon());
      await expect(servicio.aplicar(ANA, 'compra-1', 'OTRO')).rejects.toThrow(CompraYaTieneCupon);
    });

    it('solo antes de pagar', async () => {
      const { servicio } = construir(compra({ estado: EstadoCompra.PAGADA }), cupon());
      await expect(servicio.aplicar(ANA, 'compra-1', 'HEXA10')).rejects.toThrow(CompraNoAdmiteCupon);
    });

    it('no sobre una reserva vencida', async () => {
      const { servicio } = construir(compra({ expiraEn: new Date(Date.now() - 1000) }), cupon());
      await expect(servicio.aplicar(ANA, 'compra-1', 'HEXA10')).rejects.toThrow(ReservaVencida);
    });
  });

  describe('quitar (CU-004B)', () => {
    it('devuelve el uso al cupón y recalcula sin descuento', async () => {
      const { servicio, gestor, contadores } = construir(compra({ codigoPromocional: 'HEXA10', descuento: 36000, total: 324000 }), null);

      const resultado = await servicio.quitar(ANA, 'compra-1');

      expect(contadores.liberarUsoCupon).toHaveBeenCalledWith(gestor, 'HEXA10');
      expect(resultado).toMatchObject({ descuento: 0, total: 360000, codigoPromocional: null });
    });

    it('si no había uso reservado, no descuenta del contador (no regala usos)', async () => {
      const { servicio, gestor, contadores } = construir(compra({ codigoPromocional: 'HEXA10' }), null);
      gestor.update.mockResolvedValueOnce({ affected: 0 });

      await servicio.quitar(ANA, 'compra-1');

      expect(contadores.liberarUsoCupon).not.toHaveBeenCalled();
    });

    it('sin código aplicado, no hace nada', async () => {
      const { servicio, gestor } = construir(compra(), null);

      await servicio.quitar(ANA, 'compra-1');

      expect(gestor.update).not.toHaveBeenCalled();
    });
  });

  it('al pagar, el uso reservado pasa a confirmado', async () => {
    const { servicio, gestor } = construir(null, null);

    await servicio.confirmarUso(gestor as never, 'compra-1');

    expect(gestor.update).toHaveBeenCalledWith(
      UsoPromocion,
      { compraId: 'compra-1', estado: EstadoUsoPromocion.RESERVADO },
      { estado: EstadoUsoPromocion.CONFIRMADO },
    );
  });
});
