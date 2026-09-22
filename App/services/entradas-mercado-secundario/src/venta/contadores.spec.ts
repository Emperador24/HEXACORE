import { EntityManager } from 'typeorm';
import { CodigoPromocional } from '../persistencia/entidades/codigo-promocional.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';
import { Contadores } from './contadores';

/**
 * Los contadores atómicos. Aquí se comprueba el SQL que arman —que la
 * condición y el cambio van en la misma sentencia— y que `n` solo puede ser un
 * entero positivo. Que Postgres los ejecute bien bajo concurrencia se comprobó
 * contra la base real: 20 peticiones a la vez sobre un cupón de 5 usos dejaron
 * exactamente 5.
 */
describe('Contadores', () => {
  function gestorQueAfecta(filas: number) {
    const consulta = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: filas }),
    };
    const tx = { createQueryBuilder: () => consulta } as unknown as EntityManager;
    return { tx, consulta };
  }

  const cambio = (consulta: { set: jest.Mock }, columna: string) =>
    (consulta.set.mock.calls[0][0] as Record<string, () => string>)[columna]();

  it('reservar cupo: suma a reservadas solo si cabe en el aforo, en una sola sentencia', async () => {
    const { tx, consulta } = gestorQueAfecta(1);

    expect(await new Contadores().reservarCupo(tx, 'loc-1', 3)).toBe(true);
    expect(consulta.update).toHaveBeenCalledWith(LocalidadEvento);
    expect(cambio(consulta, 'reservadas')).toBe('reservadas + 3');
    expect(consulta.where).toHaveBeenCalledWith('localidad_id = :id AND vendidas + reservadas + 3 <= aforo', { id: 'loc-1' });
  });

  it('devuelve false si el UPDATE no afectó ninguna fila (no cabía)', async () => {
    const { tx } = gestorQueAfecta(0);
    expect(await new Contadores().reservarCupo(tx, 'loc-1', 3)).toBe(false);
  });

  it('confirmar cupo: pasa de reservadas a vendidas', async () => {
    const { tx, consulta } = gestorQueAfecta(1);

    await new Contadores().confirmarCupo(tx, 'loc-1', 2);

    expect(cambio(consulta, 'reservadas')).toBe('reservadas - 2');
    expect(cambio(consulta, 'vendidas')).toBe('vendidas + 2');
  });

  it.each([
    ['liberarReserva', 'reservadas >= 2'],
    ['devolverVendidas', 'vendidas >= 2'],
  ])('%s nunca deja el contador en negativo', async (metodo, condicion) => {
    const { tx, consulta } = gestorQueAfecta(1);

    await (new Contadores() as unknown as Record<string, (tx: EntityManager, id: string, n: number) => Promise<boolean>>)[metodo](tx, 'loc-1', 2);

    expect(consulta.where.mock.calls[0][0]).toContain(condicion);
  });

  it('ocupar un uso del cupón respeta el límite', async () => {
    const { tx, consulta } = gestorQueAfecta(1);

    await new Contadores().ocuparUsoCupon(tx, 'HEXA10');

    expect(consulta.update).toHaveBeenCalledWith(CodigoPromocional);
    expect(consulta.where.mock.calls[0][0]).toContain('(limite_usos IS NULL OR usos < limite_usos)');
  });

  it('liberar un uso del cupón no baja de cero', async () => {
    const { tx, consulta } = gestorQueAfecta(1);
    await new Contadores().liberarUsoCupon(tx, 'HEXA10');
    expect(consulta.where.mock.calls[0][0]).toContain('usos > 0');
  });

  it('sumar un asistente respeta el aforo del recinto', async () => {
    const { tx, consulta } = gestorQueAfecta(1);

    await new Contadores().sumarAsistente(tx, 'evt-1');

    expect(consulta.update).toHaveBeenCalledWith(EventoReferencia);
    expect(consulta.where.mock.calls[0][0]).toContain('(aforo_maximo IS NULL OR asistentes < aforo_maximo)');
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza %s como cantidad: solo se interpolan enteros positivos', async (n) => {
    const { tx } = gestorQueAfecta(1);
    await expect(new Contadores().reservarCupo(tx, 'loc-1', n)).rejects.toThrow('entero positivo');
  });
});
