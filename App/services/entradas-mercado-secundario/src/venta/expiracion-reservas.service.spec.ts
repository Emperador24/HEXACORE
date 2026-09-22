import { GestorConcurrencia } from '../reventa/concurrencia/gestor-concurrencia.service';
import { CompraService } from './compra.service';
import { ExpiracionReservas } from './expiracion-reservas.service';

/** CU-001B: el barrido periódico de reservas vencidas. */
describe('ExpiracionReservas — CU-001B', () => {
  function construir(testigo: string | null = 'testigo-1') {
    const compras = { expirarVencidas: jest.fn().mockResolvedValue(2) };
    const concurrencia = {
      bloquearTarea: jest.fn().mockResolvedValue(testigo),
      liberarTarea: jest.fn().mockResolvedValue(true),
    };
    const barrido = new ExpiracionReservas(compras as unknown as CompraService, concurrencia as unknown as GestorConcurrencia);
    return { barrido, compras, concurrencia };
  }

  it('toma el bloqueo de tarea, barre y lo suelta', async () => {
    const { barrido, compras, concurrencia } = construir();

    await barrido.barrer();

    expect(compras.expirarVencidas).toHaveBeenCalled();
    expect(concurrencia.liberarTarea).toHaveBeenCalledWith('venta-expirar-reservas', 'testigo-1');
  });

  it('si otra réplica está barriendo, no hace nada (ASR-06)', async () => {
    const { barrido, compras } = construir(null);

    await barrido.barrer();

    expect(compras.expirarVencidas).not.toHaveBeenCalled();
  });

  it('sin Redis se salta el ciclo en vez de romper', async () => {
    const { barrido, compras, concurrencia } = construir();
    concurrencia.bloquearTarea.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(barrido.barrer()).resolves.toBeUndefined();
    expect(compras.expirarVencidas).not.toHaveBeenCalled();
  });

  it('si el barrido falla, suelta igual el bloqueo', async () => {
    const { barrido, compras, concurrencia } = construir();
    compras.expirarVencidas.mockRejectedValue(new Error('se cayó la base'));

    await barrido.barrer();

    expect(concurrencia.liberarTarea).toHaveBeenCalled();
  });
});
