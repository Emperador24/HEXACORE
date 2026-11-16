import { repartir } from './dinero';

/**
 * El reparto tiene un invariante que la base de datos hace cumplir con
 * `CHECK (precio = comision + neto_vendedor)`: si no cuadra al centavo, la
 * inserción falla y el checkout se cae. Estas pruebas cubren los casos donde
 * la aritmética en coma flotante rompería esa igualdad.
 */
describe('repartir', () => {
  it('reparte un importe redondo', () => {
    expect(repartir(300000, 10)).toEqual({ precio: 300000, comision: 30000, netoVendedor: 270000 });
  });

  it('no cobra comisión cuando el porcentaje es cero', () => {
    expect(repartir(120000, 0)).toEqual({ precio: 120000, comision: 0, netoVendedor: 120000 });
  });

  it('cuadra con céntimos y un porcentaje que no divide exacto', () => {
    // 299999,99 × 10 % = 29999,999 -> 30000,00 al redondear.
    // Calcular el neto por separado daría 269999,99 + 30000,00 = 299999,99 por
    // pura suerte; con otros valores no cuadraría. Aquí el neto es el resto.
    const reparto = repartir(299999.99, 10);
    expect(reparto.comision + reparto.netoVendedor).toBe(reparto.precio);
  });

  it('cuadra siempre, para cualquier precio y porcentaje', () => {
    const precios = [1, 0.01, 99.99, 12345.67, 999999.99, 3333.33, 7.77];
    const porcentajes = [0, 1, 3, 7.5, 10, 12.5, 33.33, 99];

    for (const precio of precios) {
      for (const porcentaje of porcentajes) {
        const { comision, netoVendedor, precio: total } = repartir(precio, porcentaje);
        // La igualdad se comprueba en centavos enteros, que es como la ve la
        // base: comparar los decimales con toBe volvería a meter el error de
        // coma flotante que este código evita.
        expect(Math.round(comision * 100) + Math.round(netoVendedor * 100)).toBe(Math.round(total * 100));
        expect(comision).toBeGreaterThanOrEqual(0);
        expect(netoVendedor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('nunca deja al vendedor con más de lo que paga el comprador', () => {
    for (const porcentaje of [0, 5, 10, 50, 99]) {
      const { precio, netoVendedor } = repartir(250000, porcentaje);
      expect(netoVendedor).toBeLessThanOrEqual(precio);
    }
  });
});
