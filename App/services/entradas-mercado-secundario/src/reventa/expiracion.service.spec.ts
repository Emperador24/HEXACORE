import { DataSource } from 'typeorm';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { ExpiracionService } from './expiracion.service';

/**
 * El barrido de expiración (CU-006D) toca publicaciones y entradas a la vez,
 * así que lo que más importa es **lo que decide no tocar**: una publicación con
 * una compra en curso, o una que alguien acaba de comprar entre la lectura y la
 * escritura.
 *
 * Aquí se sustituyen la base y Redis por dobles (RNF-18); la prueba contra
 * infraestructura real está en `pruebas/cu006d-expiracion.py`.
 */
describe('ExpiracionService', () => {
  const ahora = new Date('2026-09-14T12:00:00.000Z');

  function publicacionVencida(id: string): PublicacionReventa {
    return {
      id,
      entradaId: `entrada-de-${id}`,
      estado: EstadoPublicacion.ACTIVA,
      fechaExpiracion: new Date('2026-09-14T11:00:00.000Z'),
    } as PublicacionReventa;
  }

  /**
   * Doble de la base. `afectadas` decide cuántas filas dice haber actualizado
   * el UPDATE, que es como se simula que alguien compró la publicación entre la
   * lectura y la escritura.
   */
  function fuenteDatosCon(vencidas: PublicacionReventa[], afectadas = 1) {
    const update = jest.fn().mockResolvedValue({ affected: afectadas });
    const find = jest.fn().mockResolvedValue(vencidas);
    return {
      fuente: {
        manager: { find },
        transaction: (trabajo: (tx: unknown) => Promise<unknown>) => trabajo({ update }),
      } as unknown as DataSource,
      update,
      find,
    };
  }

  /** Doble del gestor de bloqueos. `enCheckout` son las publicaciones reservadas. */
  function concurrenciaCon(enCheckout: string[] = []) {
    return {
      tiempoRestanteMs: jest.fn((id: string) => Promise.resolve(enCheckout.includes(id) ? 45_000 : null)),
      bloquearTarea: jest.fn().mockResolvedValue('testigo'),
      liberarTarea: jest.fn().mockResolvedValue(true),
    } as unknown as GestorConcurrencia;
  }

  it('cierra una publicación vencida y devuelve la entrada a su dueño', async () => {
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')]);
    const servicio = new ExpiracionService(fuente, concurrenciaCon());

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 1, expiradas: 1, omitidasPorCheckout: 0 });

    // Se cierra la publicación...
    expect(update).toHaveBeenNthCalledWith(
      1,
      PublicacionReventa,
      { id: 'p1', estado: EstadoPublicacion.ACTIVA },
      { estado: EstadoPublicacion.EXPIRADA, fechaCierre: ahora },
    );
    // ...y la entrada vuelve a estar disponible para su dueño.
    expect(update).toHaveBeenNthCalledWith(
      2,
      Entrada,
      { id: 'entrada-de-p1', estado: EstadoEntrada.EN_REVENTA },
      { estado: EstadoEntrada.VALIDA },
    );
  });

  it('no toca una publicación con una compra en curso', async () => {
    // Su bloqueo de checkout sigue vivo: expirarla ahora rompería un cobro a
    // medias. Se deja para el ciclo siguiente.
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')]);
    const servicio = new ExpiracionService(fuente, concurrenciaCon(['p1']));

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 1, expiradas: 0, omitidasPorCheckout: 1 });
    expect(update).not.toHaveBeenCalled();
  });

  it('no pisa una publicación que se vendió entre la lectura y la escritura', async () => {
    // El UPDATE lleva `estado: ACTIVA` en el WHERE; si ya no lo está, no afecta
    // a ninguna fila y no se cuenta como expirada.
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')], 0);
    const servicio = new ExpiracionService(fuente, concurrenciaCon());

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado.expiradas).toBe(0);
    // Solo el intento sobre la publicación; nunca se toca la entrada de una
    // venta ajena.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('procesa varias y cuenta bien las omitidas', async () => {
    const { fuente } = fuenteDatosCon([publicacionVencida('p1'), publicacionVencida('p2'), publicacionVencida('p3')]);
    const servicio = new ExpiracionService(fuente, concurrenciaCon(['p2']));

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 3, expiradas: 2, omitidasPorCheckout: 1 });
  });

  it('no hace nada cuando no hay nada vencido', async () => {
    const { fuente, update } = fuenteDatosCon([]);
    const servicio = new ExpiracionService(fuente, concurrenciaCon());

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 0, expiradas: 0, omitidasPorCheckout: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  describe('barrido programado', () => {
    it('no barre si otra réplica tiene el bloqueo de la tarea', async () => {
      // ASR-06 prevé varias instancias: sin esto, todas barrerían a la vez.
      const { fuente, find } = fuenteDatosCon([publicacionVencida('p1')]);
      const concurrencia = concurrenciaCon();
      (concurrencia.bloquearTarea as jest.Mock).mockResolvedValue(null);

      await new ExpiracionService(fuente, concurrencia).barrer();

      expect(find).not.toHaveBeenCalled();
    });

    it('libera el bloqueo aunque el barrido falle', async () => {
      const { fuente, find } = fuenteDatosCon([]);
      (find as jest.Mock).mockRejectedValue(new Error('la base se cayó'));
      const concurrencia = concurrenciaCon();

      // Un fallo no debe propagarse: tumbaría el temporizador y no volvería a
      // barrerse nunca.
      await expect(new ExpiracionService(fuente, concurrencia).barrer()).resolves.toBeUndefined();

      // Y sobre todo, el bloqueo no puede quedarse retenido hasta su TTL.
      expect(concurrencia.liberarTarea).toHaveBeenCalledWith('expirar-publicaciones', 'testigo');
    });
  });
});
