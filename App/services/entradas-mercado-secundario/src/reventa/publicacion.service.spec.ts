import { DataSource, QueryFailedError } from 'typeorm';
import { ConfiguracionServicio } from '../config/configuracion';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { PublicacionService } from './publicacion.service';

/**
 * Las reglas del paso 2 del CU-006 —*"Validar que la entrada pueda revenderse
 * (propiedad, estado y políticas del evento)"*— más el tope de precio y el
 * cálculo de la ventana de reventa.
 *
 * Se prueban a través de `listarEntradasPropias`, que es donde el servicio
 * expone su veredicto: devuelve `puedePublicarse` y el código del camino que lo
 * impide. Ese veredicto es justo lo que los clientes consumen para no duplicar
 * reglas (RNF-14), así que comprobarlo aquí es comprobar lo que ven el móvil y
 * el portal.
 */
describe('PublicacionService — reglas de reventa', () => {
  const EVENTO_FUTURO = 'e0000001-0000-4000-8000-000000000001';
  const VENDEDOR = 'a0000001-0000-4000-8000-000000000001';

  /**
   * Doble del gestor de bloqueos. Por defecto no hay ningún checkout vivo, que
   * es el caso normal; `conCheckout` simula que alguien está pagando.
   */
  function concurrencia(conCheckout = false): GestorConcurrencia {
    return {
      tiempoRestanteMs: jest.fn().mockResolvedValue(conCheckout ? 45_000 : null),
    } as unknown as GestorConcurrencia;
  }

  function config(topePrecioFactor = 1.5, margenCierreMinutos = 0): ConfiguracionServicio {
    return {
      reventa: { topePrecioFactor, comisionPorcentaje: 10, bloqueoTtlSegundos: 120, margenCierreMinutos },
    } as ConfiguracionServicio;
  }

  function entrada(cambios: Partial<Entrada> = {}): Entrada {
    return {
      id: '20000000-0000-4000-8000-000000000001',
      eventoId: EVENTO_FUTURO,
      localidadNombre: 'General',
      propietarioId: VENDEDOR,
      codigoQr: 'HXC-QR-000001',
      estado: EstadoEntrada.VALIDA,
      precioOriginal: 250000,
      numeroTicket: 'TCK-2026-000001',
      creadaEn: new Date(),
      ...cambios,
    } as Entrada;
  }

  function evento(cambios: Partial<EventoReferencia> = {}): EventoReferencia {
    return {
      eventoId: EVENTO_FUTURO,
      nombre: 'HEXACORE Fest 2026',
      lugar: 'Movistar Arena',
      ciudad: 'Bogotá',
      fechaInicio: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      permiteReventa: true,
      ...cambios,
    } as EventoReferencia;
  }

  /** Doble de la base: devuelve las entradas y eventos que se le indiquen. */
  function fuenteDatosCon(entradas: Entrada[], eventos: EventoReferencia[], publicaciones: unknown[] = []) {
    const constructorConsulta = (entidad: unknown) => ({
      where: () => constructorConsulta(entidad),
      andWhere: () => constructorConsulta(entidad),
      getMany: () => Promise.resolve(entidad === EventoReferencia ? eventos : publicaciones),
    });
    return {
      getRepository: () => ({ find: () => Promise.resolve(entradas) }),
      manager: { createQueryBuilder: constructorConsulta },
    } as unknown as DataSource;
  }

  async function veredicto(entradaDada: Entrada, eventoDado: EventoReferencia, configuracion = config()) {
    const servicio = new PublicacionService(fuenteDatosCon([entradaDada], [eventoDado]), concurrencia(), configuracion);
    const [resultado] = await servicio.listarEntradasPropias(VENDEDOR);
    return resultado;
  }

  describe('qué entradas pueden publicarse', () => {
    it('una entrada válida de un evento futuro que permite reventa', async () => {
      const resultado = await veredicto(entrada(), evento());

      expect(resultado.puedePublicarse).toBe(true);
      expect(resultado.motivoBloqueo).toBeUndefined();
    });

    it.each([
      [EstadoEntrada.USADA, 'CU-006E'],
      [EstadoEntrada.ANULADA, 'CU-006E'],
    ])('rechaza una entrada %s con el código %s', async (estado, codigo) => {
      // Pre-condición 2: "La entrada no debe haber sido utilizada".
      const resultado = await veredicto(entrada({ estado }), evento());

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe(codigo);
    });

    it('rechaza si el evento no permite reventa (CU-006F)', async () => {
      // Pre-condición 3: "El evento debe permitir reventa".
      const resultado = await veredicto(entrada(), evento({ permiteReventa: false }));

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe('CU-006F');
    });

    it('rechaza si el evento ya se celebró (CU-006D)', async () => {
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const resultado = await veredicto(entrada(), evento({ fechaInicio: ayer }));

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe('CU-006D');
    });

    it('rechaza si el servicio aún no conoce el evento', async () => {
      // La proyección local puede ir por detrás del servicio de Eventos. Sin
      // los datos del evento no se puede validar su política de reventa, y
      // suponer que sí la permite sería inventarse una regla de otro dominio.
      const servicio = new PublicacionService(fuenteDatosCon([entrada()], []), concurrencia(), config());
      const [resultado] = await servicio.listarEntradasPropias(VENDEDOR);

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe('EVENTO_NO_CONOCIDO');
    });

    it('da un motivo legible junto al código', async () => {
      // El cliente muestra este texto tal cual: si viniera vacío, el vendedor
      // vería un botón deshabilitado sin explicación.
      const resultado = await veredicto(entrada({ estado: EstadoEntrada.USADA }), evento());

      expect(resultado.detalleBloqueo).toContain('USADA');
    });
  });

  describe('tope de precio', () => {
    it('calcula el máximo como el factor configurado sobre el precio original', async () => {
      const resultado = await veredicto(entrada({ precioOriginal: 250000 }), evento());

      expect(resultado.precioMaximo).toBe(375000);
    });

    it('respeta un factor distinto', async () => {
      const resultado = await veredicto(entrada({ precioOriginal: 100000 }), evento(), config(2));

      expect(resultado.precioMaximo).toBe(200000);
    });

    it('redondea hacia abajo al centavo, nunca por encima del tope', async () => {
      // 33333,33 × 1,5 = 49999,995. Redondear hacia arriba daría un máximo que
      // supera el tope real.
      const resultado = await veredicto(entrada({ precioOriginal: 33333.33 }), evento());

      expect(resultado.precioMaximo).toBe(49999.99);
    });
  });

  describe('ventana de reventa', () => {
    it('sin margen, la reventa sigue abierta hasta que empieza el evento', async () => {
      const enUnaHora = new Date(Date.now() + 60 * 60 * 1000);
      const resultado = await veredicto(entrada(), evento({ fechaInicio: enUnaHora }));

      expect(resultado.puedePublicarse).toBe(true);
    });

    it('con margen, la reventa se cierra antes del evento', async () => {
      // Con un margen de dos horas, un evento que empieza dentro de una ya no
      // admite publicaciones nuevas.
      const enUnaHora = new Date(Date.now() + 60 * 60 * 1000);
      const resultado = await veredicto(entrada(), evento({ fechaInicio: enUnaHora }), config(1.5, 120));

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe('CU-006D');
    });
  });

  it('no falla cuando el vendedor no tiene entradas', async () => {
    const servicio = new PublicacionService(fuenteDatosCon([], []), concurrencia(), config());

    await expect(servicio.listarEntradasPropias(VENDEDOR)).resolves.toEqual([]);
  });

  // --- Publicar, cambiar precio y retirar --------------------------------

  /**
   * Doble de la base para las operaciones de escritura. `guardada` recoge lo
   * que se intentó persistir; `alGuardar` permite simular que la base rechaza
   * la escritura, como hace el índice único parcial.
   */
  function fuenteDatosEscritura(opciones: {
    entrada?: Entrada | null;
    evento?: EventoReferencia | null;
    publicacion?: PublicacionReventa | null;
    alGuardar?: () => never;
  }) {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const guardadas: unknown[] = [];
    const gestor = {
      findOne: (entidad: unknown) =>
        Promise.resolve(entidad === Entrada ? (opciones.entrada ?? null) : (opciones.publicacion ?? null)),
      findOneBy: (entidad: unknown) =>
        Promise.resolve(
          entidad === EventoReferencia
            ? (opciones.evento ?? null)
            : entidad === Entrada
              ? (opciones.entrada ?? null)
              : (opciones.publicacion ?? null),
        ),
      create: (_e: unknown, datos: unknown) => datos,
      save: jest.fn((valor: unknown) => {
        if (opciones.alGuardar) opciones.alGuardar();
        guardadas.push(valor);
        return Promise.resolve({ ...(valor as object), id: 'pub-nueva', fechaPublicacion: new Date() });
      }),
      update,
    };
    return {
      fuente: {
        transaction: (trabajo: (tx: unknown) => Promise<unknown>) => trabajo(gestor),
      } as unknown as DataSource,
      update,
      guardadas,
    };
  }

  function publicacionActiva(cambios: Partial<PublicacionReventa> = {}): PublicacionReventa {
    return {
      id: 'pub-1',
      entradaId: entrada().id,
      vendedorId: VENDEDOR,
      precio: 300000,
      precioOriginal: 250000,
      estado: EstadoPublicacion.ACTIVA,
      fechaPublicacion: new Date(),
      fechaExpiracion: new Date(Date.now() + 86_400_000),
      ...cambios,
    } as PublicacionReventa;
  }

  describe('publicar (pasos 2-4)', () => {
    it('crea la publicación y marca la entrada como EN_REVENTA', async () => {
      const { fuente, update, guardadas } = fuenteDatosEscritura({ entrada: entrada(), evento: evento() });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      const resultado = await servicio.publicar(VENDEDOR, { entradaId: entrada().id, precio: 300000 });

      expect(resultado.precio).toBe(300000);
      expect(guardadas).toHaveLength(1);
      // Las dos escrituras van juntas: una publicación en el mercado cuya
      // entrada dijera de sí misma que está VALIDA sería incoherente.
      expect(update).toHaveBeenCalledWith(Entrada, { id: entrada().id }, { estado: EstadoEntrada.EN_REVENTA });
    });

    it('calcula la expiración a partir del inicio del evento', async () => {
      const inicio = new Date(Date.now() + 86_400_000);
      const { fuente, guardadas } = fuenteDatosEscritura({ entrada: entrada(), evento: evento({ fechaInicio: inicio }) });
      const servicio = new PublicacionService(fuente, concurrencia(), config(1.5, 60));

      await servicio.publicar(VENDEDOR, { entradaId: entrada().id, precio: 300000 });

      // Con 60 minutos de margen, la ventana cierra una hora antes del evento.
      const guardada = guardadas[0] as { fechaExpiracion: Date };
      expect(guardada.fechaExpiracion.getTime()).toBe(inicio.getTime() - 60 * 60_000);
    });

    it('rechaza publicar una entrada ajena (pre-condición 1)', async () => {
      const { fuente } = fuenteDatosEscritura({ entrada: entrada(), evento: evento() });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(
        servicio.publicar('otro-usuario', { entradaId: entrada().id, precio: 300000 }),
      ).rejects.toMatchObject({ response: { codigo: 'NO_ES_PROPIETARIO' } });
    });

    it('rechaza un precio por encima del tope', async () => {
      const { fuente } = fuenteDatosEscritura({ entrada: entrada(), evento: evento() });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: entrada().id, precio: 400000 }),
      ).rejects.toMatchObject({ response: { codigo: 'PRECIO_SOBRE_TOPE', precioMaximo: 375000 } });
    });

    it('rechaza si la entrada no existe', async () => {
      const { fuente } = fuenteDatosEscritura({ entrada: null, evento: evento() });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: 'inexistente', precio: 300000 }),
      ).rejects.toMatchObject({ response: { codigo: 'ENTRADA_NO_ENCONTRADA' } });
    });

    it('traduce la violación del índice único a un error del dominio', async () => {
      // El índice `uq_publicacion_activa_por_entrada` es la red de seguridad de
      // RNF-01: si salta, no es un fallo inesperado sino el motor impidiendo una
      // segunda publicación activa. El cliente debe ver eso, no un 500.
      const violacion = new QueryFailedError('INSERT', [], new Error('duplicada'));
      (violacion as unknown as { driverError: { code: string } }).driverError = { code: '23505' };
      const { fuente } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        alGuardar: () => {
          throw violacion;
        },
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: entrada().id, precio: 300000 }),
      ).rejects.toMatchObject({ response: { codigo: 'ENTRADA_YA_PUBLICADA' } });
    });

    it('no enmascara otros errores de la base', async () => {
      // Solo el 23505 significa "ya publicada". Convertir cualquier fallo en ese
      // error escondería problemas reales.
      const otro = new QueryFailedError('INSERT', [], new Error('sin conexión'));
      (otro as unknown as { driverError: { code: string } }).driverError = { code: '08006' };
      const { fuente } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        alGuardar: () => {
          throw otro;
        },
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(servicio.publicar(VENDEDOR, { entradaId: entrada().id, precio: 300000 })).rejects.toThrow(
        QueryFailedError,
      );
    });
  });

  describe('CU-006A — cambiar el precio', () => {
    it('acepta un precio dentro del tope', async () => {
      const { fuente } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      const resultado = await servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 350000 });

      expect(resultado.precio).toBe(350000);
    });

    it('revalida el tope: no se puede publicar barato y subir después', async () => {
      // Sin esta comprobación, el tope sería trivial de saltar.
      const { fuente } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 500000 })).rejects.toMatchObject({
        response: { codigo: 'PRECIO_SOBRE_TOPE' },
      });
    });

    it('rechaza cambiar el precio de una publicación ajena', async () => {
      const { fuente } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(servicio.cambiarPrecio('otro', 'pub-1', { precio: 300000 })).rejects.toMatchObject({
        response: { codigo: 'NO_ES_PROPIETARIO' },
      });
    });

    it.each([EstadoPublicacion.VENDIDA, EstadoPublicacion.RETIRADA, EstadoPublicacion.EXPIRADA])(
      'rechaza cambiar el precio de una publicación %s',
      async (estado) => {
        const { fuente } = fuenteDatosEscritura({
          entrada: entrada(),
          evento: evento(),
          publicacion: publicacionActiva({ estado }),
        });
        const servicio = new PublicacionService(fuente, concurrencia(), config());

        await expect(servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 300000 })).rejects.toMatchObject({
          response: { codigo: 'PUBLICACION_NO_ACTIVA' },
        });
      },
    );
  });

  describe('CU-006B — retirar del mercado', () => {
    it('cierra la publicación y devuelve la entrada a VALIDA', async () => {
      const { fuente, update } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      const resultado = await servicio.retirar(VENDEDOR, 'pub-1');

      expect(resultado.estado).toBe(EstadoPublicacion.RETIRADA);
      expect(update).toHaveBeenCalledWith(Entrada, { id: entrada().id }, { estado: EstadoEntrada.VALIDA });
    });

    it('no genera historial: retirar no cambia de propietario', async () => {
      const { fuente, update } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await servicio.retirar(VENDEDOR, 'pub-1');

      // El historial registra cambios de dueño, y aquí nadie ha dejado de serlo.
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('no deja retirar una publicación que alguien está pagando', async () => {
      // El vendedor no puede sacar del mercado una entrada con un cobro en
      // vuelo: la transferencia acabaría igualmente y él creería haberla
      // retirado. Es la misma cortesía que la expiración ya tenía.
      const { fuente, update } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(true), config());

      await expect(servicio.retirar(VENDEDOR, 'pub-1')).rejects.toMatchObject({
        response: { codigo: 'CU-006H' },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('rechaza retirar una publicación ajena', async () => {
      const { fuente } = fuenteDatosEscritura({
        entrada: entrada(),
        evento: evento(),
        publicacion: publicacionActiva(),
      });
      const servicio = new PublicacionService(fuente, concurrencia(), config());

      await expect(servicio.retirar('otro', 'pub-1')).rejects.toMatchObject({
        response: { codigo: 'NO_ES_PROPIETARIO' },
      });
    });
  });
});
