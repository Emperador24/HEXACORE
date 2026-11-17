import { diaBogota, politicaCancelacion } from './cancelacion';

/** Reservas de parqueadero: con devolución solo si el evento no es hoy (hora de Colombia). */
describe('Cancelación de reservas de parqueadero', () => {
  // 16/11 a las 10:00 en Bogotá (UTC-5).
  const ahora = new Date('2026-11-16T15:00:00Z');

  it('el día se cuenta en hora de Colombia, no en UTC', () => {
    // 23:30 del 16/11 en Bogotá ya es 17/11 en UTC.
    expect(diaBogota(new Date('2026-11-17T04:30:00Z'))).toBe('2026-11-16');
  });

  it.each([
    ['mañana', '2026-11-17T23:00:00Z', true],
    ['dentro de un mes', '2026-12-16T23:00:00Z', true],
    ['hoy más tarde', '2026-11-16T23:00:00Z', false],
    ['hoy a las 23:30 de Bogotá (ya 17/11 en UTC)', '2026-11-17T04:30:00Z', false],
    ['ya empezó', '2026-11-16T12:00:00Z', false],
  ])('evento %s → con devolución: %s', (_caso, inicio, esperado) => {
    expect(politicaCancelacion(new Date(inicio), ahora).conDevolucion).toBe(esperado);
  });

  it('el mensaje dice por qué', () => {
    expect(politicaCancelacion(new Date('2026-11-16T23:00:00Z'), ahora).mensaje).toMatch(/no se puede cancelar ni tiene devolución/);
    expect(politicaCancelacion(new Date('2026-11-20T23:00:00Z'), ahora).mensaje).toMatch(/devolución completa/);
  });
});
