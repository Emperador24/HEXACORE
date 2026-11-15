import { DataSource } from 'typeorm';
import { CheckoutService } from './checkout.service';
import { PublicacionService } from './publicacion.service';
import { MotivoNoRevendible } from './cliente-ventas.service';
import { EntradaNoEncontrada, EntradaNoRevendible, EntradaYaPublicada, NoEsPropietario, VentasNoDisponible } from './reventa.errors';
import { EstadoEntrada } from '../../ventas/persistencia/entidades/entrada.entity';

/** CU-006: ramas que la e2e no alcanza sin que la base o Ventas fallen en el instante justo. */
const config = { reventa: { topePrecioFactor: 1.5, comisionPorcentaje: 10, bloqueoTtlSegundos: 120, margenCierreMinutos: 0 } } as never;

describe('Reventa · defensas', () => {
  it('paso 6: si algo falla con el bloqueo tomado, lo libera en vez de congelar la publicación dos minutos', async () => {
    const concurrencia = { bloquear: jest.fn().mockResolvedValue({ adquirido: true }), liberar: jest.fn() };
    const servicio = new CheckoutService({ manager: {} } as unknown as DataSource, {} as never, concurrencia as never, {} as never, {} as never, {} as never, config);
    jest.spyOn(servicio as never, 'cargarPublicacion')
      .mockResolvedValueOnce({ publicacion: { id: 'p' } } as never)
      .mockRejectedValueOnce(new Error('base caída') as never);
    jest.spyOn(servicio as never, 'exigirComprable').mockReturnValue(undefined as never);
    await expect(servicio.iniciar('comprador', 'p')).rejects.toThrow('base caída');
    expect(concurrencia.liberar).toHaveBeenCalledWith('p', expect.any(String));
  });

  it('pasos 2-3: cada negativa de Ventas se traduce a su propio error', () => {
    const servicio = new PublicacionService({} as DataSource, {} as never, {} as never, config);
    const porQue = (motivo: MotivoNoRevendible, estado?: string) =>
      (servicio as unknown as { porQueNoSeRetuvo(id: string, r: unknown): Error }).porQueNoSeRetuvo('e', { motivo, estado });
    expect(porQue(MotivoNoRevendible.NO_EXISTE)).toBeInstanceOf(EntradaNoEncontrada);
    expect(porQue(MotivoNoRevendible.NO_ES_SUYA)).toBeInstanceOf(NoEsPropietario);
    expect(porQue(MotivoNoRevendible.SIN_RESPUESTA)).toBeInstanceOf(VentasNoDisponible);
    expect(porQue(MotivoNoRevendible.ESTADO, EstadoEntrada.EN_REVENTA)).toBeInstanceOf(EntradaYaPublicada);
    expect(porQue(MotivoNoRevendible.ESTADO, EstadoEntrada.USADA)).toBeInstanceOf(EntradaNoRevendible);
    expect(porQue(MotivoNoRevendible.ESTADO)).toBeInstanceOf(EntradaNoRevendible);
  });
});
