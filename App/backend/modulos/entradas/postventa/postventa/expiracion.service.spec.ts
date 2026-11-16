import { DataSource } from 'typeorm';
import { ClienteVentas } from './cliente-ventas.service';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { ExpiracionService } from './expiracion.service';

/**
 * El barrido de expiración (CU-006D) cierra publicaciones aquí y libera
 * entradas en Ventas, así que lo que más importa es **lo que decide no tocar**:
 * una publicación con una compra en curso, o una que alguien acaba de comprar
 * entre la lectura y la escritura.
 *
 * Desde ADR-14 la entrada ya no está en esta base: liberarla es una llamada a
 * Ventas con el credencial de servicio, porque este trabajo corre por reloj y
 * no hay usuario cuyo token reenviar.
 *
 * Aquí se sustituyen la base, Redis y Ventas por dobles (RNF-18); la prueba
 * contra infraestructura real está en `pruebas/cu006d-expiracion.py`.
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
      fuente: { manager: { find, update } } as unknown as DataSource,
      update,
      find,
    };
  }

  /**
   * Doble del cliente de Ventas. `comoServicio` devuelve el centinela que hace
   * que la llamada vaya con el credencial de servicio en vez de un token de
   * usuario.
   */
  function ventasCon(devuelve = true) {
    const devolverDeReventa = jest.fn().mockResolvedValue(devuelve);
    return {
      cliente: { devolverDeReventa, comoServicio: () => 'credencial-de-servicio' } as unknown as ClienteVentas,
      devolverDeReventa,
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

  it('cierra una publicación vencida y pide a Ventas que libere la entrada', async () => {
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')]);
    const v = ventasCon();
    const servicio = new ExpiracionService(fuente, v.cliente, concurrenciaCon());

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 1, expiradas: 1, omitidasPorCheckout: 0 });

    // Se cierra la publicación...
    expect(update).toHaveBeenCalledWith(
      PublicacionReventa,
      { id: 'p1', estado: EstadoPublicacion.ACTIVA },
      { estado: EstadoPublicacion.EXPIRADA, fechaCierre: ahora },
    );
    // ...y la entrada vuelve a estar disponible para su dueño, con el
    // credencial de servicio: aquí no hay usuario.
    expect(v.devolverDeReventa).toHaveBeenCalledWith('entrada-de-p1', 'credencial-de-servicio');
  });

  it('cierra el anuncio ANTES de pedir la liberación', async () => {
    // Mismo orden que al retirar: si se liberara primero, quedaría un anuncio
    // activo sobre una entrada ya usable. Aquí sale gratis, porque nadie está
    // esperando: si la liberación falla, el reloj vuelve a pasar.
    const orden: string[] = [];
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')]);
    update.mockImplementation(() => {
      orden.push('cerrar-anuncio');
      return Promise.resolve({ affected: 1 });
    });
    const v = ventasCon();
    v.devolverDeReventa.mockImplementation(() => {
      orden.push('liberar-entrada');
      return Promise.resolve(true);
    });

    await new ExpiracionService(fuente, v.cliente, concurrenciaCon()).expirarVencidas(ahora);

    expect(orden).toEqual(['cerrar-anuncio', 'liberar-entrada']);
  });

  it('cuenta la publicación como expirada aunque Ventas no libere la entrada', async () => {
    // El anuncio ya está cerrado y eso no se deshace. La entrada queda
    // retenida, que es recuperable: nadie puede comprarla y el siguiente
    // barrido no la verá porque ya no está ACTIVA — se arregla a mano.
    const { fuente } = fuenteDatosCon([publicacionVencida('p1')]);
    const servicio = new ExpiracionService(fuente, ventasCon(false).cliente, concurrenciaCon());

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado.expiradas).toBe(1);
  });

  it('no toca una publicación con una compra en curso', async () => {
    // Su bloqueo de checkout sigue vivo: expirarla ahora rompería un cobro a
    // medias. Se deja para el ciclo siguiente.
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')]);
    const v = ventasCon();
    const servicio = new ExpiracionService(fuente, v.cliente, concurrenciaCon(['p1']));

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 1, expiradas: 0, omitidasPorCheckout: 1 });
    expect(update).not.toHaveBeenCalled();
    expect(v.devolverDeReventa).not.toHaveBeenCalled();
  });

  it('no pisa una publicación que se vendió entre la lectura y la escritura', async () => {
    // El UPDATE lleva `estado: ACTIVA` en el WHERE; si ya no lo está, no afecta
    // a ninguna fila y no se cuenta como expirada.
    const { fuente, update } = fuenteDatosCon([publicacionVencida('p1')], 0);
    const v = ventasCon();
    const servicio = new ExpiracionService(fuente, v.cliente, concurrenciaCon());

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado.expiradas).toBe(0);
    // Solo el intento sobre la publicación; nunca se libera la entrada de una
    // venta ajena. Liberarla aquí anularía el QR nuevo del comprador.
    expect(update).toHaveBeenCalledTimes(1);
    expect(v.devolverDeReventa).not.toHaveBeenCalled();
  });

  it('procesa varias y cuenta bien las omitidas', async () => {
    const { fuente } = fuenteDatosCon([publicacionVencida('p1'), publicacionVencida('p2'), publicacionVencida('p3')]);
    const servicio = new ExpiracionService(fuente, ventasCon().cliente, concurrenciaCon(['p2']));

    const resultado = await servicio.expirarVencidas(ahora);

    expect(resultado).toEqual({ revisadas: 3, expiradas: 2, omitidasPorCheckout: 1 });
  });

  it('no hace nada cuando no hay nada vencido', async () => {
    const { fuente, update } = fuenteDatosCon([]);
    const servicio = new ExpiracionService(fuente, ventasCon().cliente, concurrenciaCon());

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

      await new ExpiracionService(fuente, ventasCon().cliente, concurrencia).barrer();

      expect(find).not.toHaveBeenCalled();
    });

    it('libera el bloqueo aunque el barrido falle', async () => {
      const { fuente, find } = fuenteDatosCon([]);
      (find as jest.Mock).mockRejectedValue(new Error('la base se cayó'));
      const concurrencia = concurrenciaCon();

      // Un fallo no debe propagarse: tumbaría el temporizador y no volvería a
      // barrerse nunca.
      await expect(
        new ExpiracionService(fuente, ventasCon().cliente, concurrencia).barrer(),
      ).resolves.toBeUndefined();

      // Y sobre todo, el bloqueo no puede quedarse retenido hasta su TTL.
      expect(concurrencia.liberarTarea).toHaveBeenCalledWith('expirar-publicaciones', 'testigo');
    });
  });
});
