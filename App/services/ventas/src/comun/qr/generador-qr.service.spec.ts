import { LARGO_CODIGO } from '../../persistencia/columnas';
import { GeneradorQr } from './generador-qr.service';

/**
 * El atributo de Seguridad del CU-006 pide impedir *"la falsificación de
 * códigos QR"*. Un código adivinable permite entrar al evento con una entrada
 * ajena, así que lo que se comprueba aquí no es que "funcione" sino que sea
 * impredecible y no colisione.
 */
describe('GeneradorQr', () => {
  const qr = new GeneradorQr();

  it('emite códigos con el prefijo reconocible del sistema', () => {
    expect(qr.emitir()).toMatch(/^HXC-QR-/);
  });

  it('cabe en la columna de la base de datos', () => {
    // Si excediera `varchar(64)` la transferencia fallaría al guardar, después
    // de haber cobrado.
    expect(qr.emitir().length).toBeLessThanOrEqual(LARGO_CODIGO);
  });

  it('no repite un código en diez mil emisiones', () => {
    // El prototipo usaba seis dígitos aleatorios: un millón de combinaciones,
    // con colisiones esperables mucho antes de esta cifra.
    const codigos = new Set(Array.from({ length: 10_000 }, () => qr.emitir()));
    expect(codigos.size).toBe(10_000);
  });

  it('usa suficiente entropía como para no ser adivinable', () => {
    // 12 bytes en base64url son 16 caracteres tras el prefijo: 96 bits. Si
    // alguien acortara esto, la prueba lo detendría.
    const sufijo = qr.emitir().replace('HXC-QR-', '');
    expect(sufijo.length).toBeGreaterThanOrEqual(16);
    expect(sufijo).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('no produce una secuencia predecible', () => {
    // Con un generador tipo `Math.random()` o un contador, códigos consecutivos
    // comparten estructura. Aquí dos códigos seguidos no deben parecerse.
    const [a, b] = [qr.emitir(), qr.emitir()];
    const sufijoA = a.replace('HXC-QR-', '');
    const sufijoB = b.replace('HXC-QR-', '');
    const comunes = [...sufijoA].filter((caracter, i) => caracter === sufijoB[i]).length;
    // Por azar coincidirían ~1 de 64 posiciones; se deja margen amplio para no
    // tener una prueba que falle de vez en cuando por casualidad.
    expect(comunes).toBeLessThan(sufijoA.length / 2);
  });
});
