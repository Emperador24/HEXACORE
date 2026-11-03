import { ReglasVenta } from '../config/configuracion';
import { CodigoPromocional } from '../persistencia/entidades/codigo-promocional.entity';
import {
  calcularImportes,
  evaluarCupon,
  montoReembolso,
  normalizarCodigo,
  politicaCancelacion,
  repartirPorEntrada,
} from './reglas';

/**
 * Las reglas de dinero, plazos y cupones de la venta primaria. Son funciones
 * puras: se prueban caso por caso, sin base de datos.
 */
describe('reglas de la venta primaria', () => {
  describe('importes (CU-001 paso 4, CU-004 pasos 5-6)', () => {
    it('sin descuento, el total es precio por cantidad', () => {
      expect(calcularImportes(180000, 2)).toEqual({ subtotal: 360000, descuento: 0, total: 360000 });
    });

    it('aplica el porcentaje sobre el subtotal', () => {
      expect(calcularImportes(180000, 2, 10)).toEqual({ subtotal: 360000, descuento: 36000, total: 324000 });
    });

    it('trabaja en centavos: subtotal, descuento y total siempre cuadran', () => {
      // 33.333,33 × 3 = 99.999,99; con coma flotante se descuadraría.
      const { subtotal, descuento, total } = calcularImportes(33333.33, 3, 15);
      expect(Math.round((subtotal - descuento) * 100)).toBe(Math.round(total * 100));
      expect(subtotal).toBe(99999.99);
    });

    it('redondea el descuento hacia abajo', () => {
      // 15 % de 999,99 = 149,9985 → 149,99, nunca 150,00.
      expect(calcularImportes(999.99, 1, 15).descuento).toBe(149.99);
    });
  });

  describe('reparto del total por entrada', () => {
    it('divide exacto cuando se puede', () => {
      expect(repartirPorEntrada(324000, 2)).toEqual([162000, 162000]);
    });

    it('da el centavo sobrante a las primeras entradas, y la suma es el total', () => {
      const partes = repartirPorEntrada(100000, 3);
      expect(partes).toEqual([33333.34, 33333.33, 33333.33]);
      expect(Math.round(partes.reduce((a, b) => a + b, 0) * 100)).toBe(10000000);
    });
  });

  describe('monto de reembolso (CU-003 paso 4)', () => {
    it('devuelve el porcentaje de lo pagado por las entradas canceladas', () => {
      expect(montoReembolso([70000, 70000], 50)).toBe(70000);
    });

    it('con el 100 %, devuelve exactamente lo pagado', () => {
      expect(montoReembolso([33333.34, 33333.33], 100)).toBe(66666.67);
    });
  });

  describe('política de cancelación (CU-003 paso 3 y CU-003A)', () => {
    const reglas: ReglasVenta = {
      reservaMinutos: 10,
      cancelacionTotalDias: 7,
      cancelacionParcialHoras: 48,
      cancelacionParcialPorcentaje: 50,
    };
    const ahora = new Date('2026-09-19T12:00:00Z');
    const dentroDe = (horas: number) => new Date(ahora.getTime() + horas * 3_600_000);

    it.each([
      [7 * 24, 100, 'TOTAL'],
      [7 * 24 - 1, 50, 'PARCIAL'],
      [48, 50, 'PARCIAL'],
      [47, null, 'FUERA_DE_PLAZO'],
      [-5, null, 'FUERA_DE_PLAZO'],
    ])('a %d horas del evento → %s %%', (horas, porcentaje, tramo) => {
      expect(politicaCancelacion(dentroDe(horas), false, ahora, reglas)).toEqual({ porcentaje, tramo });
    });

    it('si el organizador canceló el evento, devuelve todo sin importar la fecha', () => {
      expect(politicaCancelacion(dentroDe(-5), true, ahora, reglas)).toEqual({
        porcentaje: 100,
        tramo: 'EVENTO_CANCELADO',
      });
    });
  });

  describe('validez de un cupón (CU-004 pasos 2-4)', () => {
    const ahora = new Date('2026-09-19T12:00:00Z');
    const compra = { eventoId: 'evento-a', localidadId: 'localidad-a' };
    const cupon = (cambios: Partial<CodigoPromocional> = {}): CodigoPromocional =>
      ({
        codigo: 'HEXA10',
        porcentaje: 10,
        eventoId: null,
        localidadId: null,
        vigenteDesde: new Date('2026-01-01'),
        vigenteHasta: new Date('2027-01-01'),
        limiteUsos: 100,
        usos: 0,
        activo: true,
        ...cambios,
      }) as CodigoPromocional;

    it('un cupón vigente, con usos y sin restricciones sirve', () => {
      expect(evaluarCupon(cupon(), compra, ahora)).toBeNull();
    });

    it.each([
      ['no existe', null],
      ['no existe', cupon({ activo: false })],
      ['todavía no está vigente', cupon({ vigenteDesde: new Date('2026-10-01') })],
      ['ya venció', cupon({ vigenteHasta: new Date('2026-09-01') })],
    ])('CU-004C: %s', (motivo, dado) => {
      expect(evaluarCupon(dado, compra, ahora)).toEqual({ tipo: 'INVALIDO', motivo });
    });

    it.each([
      ['otro evento', cupon({ eventoId: 'evento-b' })],
      ['otra localidad', cupon({ localidadId: 'localidad-b' })],
    ])('CU-004A: si es de %s, no aplica', (_caso, dado) => {
      expect(evaluarCupon(dado, compra, ahora)).toEqual({ tipo: 'NO_APLICA' });
    });

    it('sirve si es del mismo evento y localidad', () => {
      expect(evaluarCupon(cupon({ eventoId: 'evento-a', localidadId: 'localidad-a' }), compra, ahora)).toBeNull();
    });

    it('CU-004D: sin usos disponibles', () => {
      expect(evaluarCupon(cupon({ limiteUsos: 5, usos: 5 }), compra, ahora)).toEqual({ tipo: 'AGOTADO' });
    });

    it('sin límite de usos, nunca se agota', () => {
      expect(evaluarCupon(cupon({ limiteUsos: null, usos: 1_000_000 }), compra, ahora)).toBeNull();
    });
  });

  it('normaliza el código como lo escribe el cliente', () => {
    expect(normalizarCodigo('  hexa10 ')).toBe('HEXA10');
  });
});
