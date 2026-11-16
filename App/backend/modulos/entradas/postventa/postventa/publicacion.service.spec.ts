import { DataSource, QueryFailedError } from 'typeorm';
import { ConfiguracionServicio } from '../config/configuracion';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import {
  ClienteVentas,
  EntradaPropia,
  EstadoEntrada,
  MotivoNoRevendible,
} from './cliente-ventas.service';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { PublicacionService } from './publicacion.service';

/**
 * Las reglas del paso 2 del CU-006 —*"Validar que la entrada pueda revenderse
 * (propiedad, estado y políticas del evento)"*— más el tope de precio, la
 * ventana de reventa, y las compensaciones de las dos Sagas.
 *
 * ## Qué cambió con ADR-14
 *
 * Antes publicar y retirar eran transacciones: si algo fallaba, el rollback
 * deshacía las dos escrituras y no había nada que probar. Ahora la entrada vive
 * en Ventas, no hay transacción que abarque las dos bases, y **cada camino de
 * fallo tiene una compensación que puede fallar a su vez**. Eso es código
 * nuevo, y es el que más se prueba aquí.
 *
 * Las reglas de estado se siguen probando a través de `listarEntradasPropias`,
 * que es donde el servicio expone su veredicto para que los clientes no
 * dupliquen reglas (RNF-14).
 */
describe('PublicacionService — reglas de reventa y Sagas', () => {
  const EVENTO_FUTURO = 'e0000001-0000-4000-8000-000000000001';
  const VENDEDOR = 'a0000001-0000-4000-8000-000000000001';
  const ENTRADA = '20000000-0000-4000-8000-000000000001';
  const TOKEN = 'token-de-sesion';

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

  /** Una entrada tal como la devuelve Ventas, no como la guardaba esta base. */
  function entrada(cambios: Partial<EntradaPropia> = {}): EntradaPropia {
    return {
      entradaId: ENTRADA,
      eventoId: EVENTO_FUTURO,
      localidadNombre: 'General',
      precioOriginal: 250000,
      numeroTicket: 'TCK-2026-000001',
      estado: EstadoEntrada.VALIDA,
      ...cambios,
    };
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

  /**
   * Doble del cliente de Ventas.
   *
   * `marcarEnReventa: null` representa las dos negativas que no se distinguen
   * al publicar —no es tuya, o no está disponible—, porque ninguna de las dos
   * deja nada escrito. `devolverDeReventa: false` representa la compensación
   * que no funciona, que es el caso interesante.
   */
  function ventas(
    opciones: {
      entradas?: EntradaPropia[] | null;
      marcar?: EntradaPropia | null;
      motivo?: MotivoNoRevendible;
      estadoEntrada?: string;
      devolver?: boolean;
    } = {},
  ) {
    const retencion =
      opciones.motivo !== undefined
        ? { marcada: false, motivo: opciones.motivo, estado: opciones.estadoEntrada }
        : opciones.marcar === null
          ? { marcada: false, motivo: MotivoNoRevendible.ESTADO, estado: EstadoEntrada.USADA }
          : { marcada: true, entrada: opciones.marcar ?? entrada() };
    const marcarEnReventa = jest.fn().mockResolvedValue(retencion);
    const devolverDeReventa = jest.fn().mockResolvedValue(opciones.devolver ?? true);
    const entradasDe = jest.fn().mockResolvedValue(opciones.entradas === undefined ? [] : opciones.entradas);
    return {
      cliente: { marcarEnReventa, devolverDeReventa, entradasDe } as unknown as ClienteVentas,
      marcarEnReventa,
      devolverDeReventa,
      entradasDe,
    };
  }

  /** Doble de la base para las lecturas: eventos y publicaciones activas. */
  function fuenteDatosCon(eventos: EventoReferencia[], publicaciones: unknown[] = []) {
    const constructorConsulta = (entidad: unknown) => ({
      where: () => constructorConsulta(entidad),
      andWhere: () => constructorConsulta(entidad),
      getMany: () => Promise.resolve(entidad === EventoReferencia ? eventos : publicaciones),
    });
    return { manager: { createQueryBuilder: constructorConsulta } } as unknown as DataSource;
  }

  async function veredicto(entradaDada: EntradaPropia, eventoDado: EventoReferencia | null, configuracion = config()) {
    const servicio = new PublicacionService(
      fuenteDatosCon(eventoDado ? [eventoDado] : []),
      ventas({ entradas: [entradaDada] }).cliente,
      concurrencia(),
      configuracion,
    );
    const [resultado] = await servicio.listarEntradasPropias(VENDEDOR, TOKEN);
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
      const resultado = await veredicto(entrada(), null);

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe('EVENTO_NO_CONOCIDO');
    });

    it('da un motivo legible junto al código', async () => {
      // El cliente muestra este texto tal cual: si viniera vacío, el vendedor
      // vería un botón deshabilitado sin explicación.
      const resultado = await veredicto(entrada({ estado: EstadoEntrada.USADA }), evento());

      expect(resultado.detalleBloqueo).toContain('USADA');
    });

    it('cierra la ventana con el margen configurado antes del evento', async () => {
      const enUnaHora = new Date(Date.now() + 60 * 60 * 1000);
      const resultado = await veredicto(entrada(), evento({ fechaInicio: enUnaHora }), config(1.5, 120));

      expect(resultado.puedePublicarse).toBe(false);
      expect(resultado.motivoBloqueo).toBe('CU-006D');
    });
  });

  it('no falla cuando el vendedor no tiene entradas', async () => {
    const servicio = new PublicacionService(fuenteDatosCon([]), ventas().cliente, concurrencia(), config());

    await expect(servicio.listarEntradasPropias(VENDEDOR, TOKEN)).resolves.toEqual([]);
  });

  it('distingue "no tienes entradas" de "no pude preguntarlo"', async () => {
    // Devolver una lista vacía cuando Ventas no responde haría que alguien
    // creyera que perdió su entrada. Un 503 dice lo que de verdad pasó.
    const servicio = new PublicacionService(
      fuenteDatosCon([]),
      ventas({ entradas: null }).cliente,
      concurrencia(),
      config(),
    );

    await expect(servicio.listarEntradasPropias(VENDEDOR, TOKEN)).rejects.toMatchObject({
      response: { codigo: 'VENTAS_NO_DISPONIBLE' },
    });
  });

  // --- Publicar, cambiar precio y retirar --------------------------------

  /**
   * Doble de la base para las operaciones de escritura.
   *
   * `publicar` escribe por `manager` —ya no abre transacción, porque la otra
   * mitad del trabajo está en otro servicio— mientras `cambiarPrecio` y
   * `retirar` siguen usando una, que ahora solo cubre su parte local.
   */
  function fuenteDatosEscritura(opciones: {
    evento?: EventoReferencia | null;
    publicacion?: PublicacionReventa | null;
    alGuardar?: () => never;
  }) {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const guardadas: unknown[] = [];
    const gestor = {
      findOne: () => Promise.resolve(opciones.publicacion ?? null),
      findOneBy: (entidad: unknown) =>
        Promise.resolve(entidad === EventoReferencia ? (opciones.evento ?? null) : (opciones.publicacion ?? null)),
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
        manager: gestor,
        transaction: (trabajo: (tx: unknown) => Promise<unknown>) => trabajo(gestor),
      } as unknown as DataSource,
      update,
      guardadas,
      gestor,
    };
  }

  function publicacionActiva(cambios: Partial<PublicacionReventa> = {}): PublicacionReventa {
    return {
      id: 'pub-1',
      entradaId: ENTRADA,
      vendedorId: VENDEDOR,
      precio: 300000,
      precioOriginal: 250000,
      eventoId: EVENTO_FUTURO,
      numeroTicket: 'TCK-2026-000001',
      localidadNombre: 'General',
      estado: EstadoPublicacion.ACTIVA,
      fechaPublicacion: new Date(),
      fechaExpiracion: new Date(Date.now() + 86_400_000),
      ...cambios,
    } as PublicacionReventa;
  }

  describe('publicar (pasos 2-4)', () => {
    it('retiene la entrada en Ventas y crea la publicación', async () => {
      const { fuente, guardadas } = fuenteDatosEscritura({ evento: evento() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      const resultado = await servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN);

      expect(resultado.precio).toBe(300000);
      expect(guardadas).toHaveLength(1);
      expect(v.marcarEnReventa).toHaveBeenCalledWith(ENTRADA, VENDEDOR, TOKEN);
      expect(v.devolverDeReventa).not.toHaveBeenCalled();
    });

    it('la entrada se retiene ANTES de crear la publicación', async () => {
      // El orden es la garantía de RNF-01, no un detalle. Al revés existiría un
      // anuncio sobre una entrada todavía usable: su dueño podría entrar al
      // evento con ella mientras alguien la compra.
      const orden: string[] = [];
      const { fuente } = fuenteDatosEscritura({ evento: evento() });
      (fuente.manager as unknown as { save: jest.Mock }).save = jest.fn((valor: unknown) => {
        orden.push('crear-publicacion');
        return Promise.resolve({ ...(valor as object), id: 'pub-nueva', fechaPublicacion: new Date() });
      });
      const v = ventas();
      v.marcarEnReventa.mockImplementation(() => {
        orden.push('retener-entrada');
        return Promise.resolve({ marcada: true, entrada: entrada() });
      });
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN);

      expect(orden).toEqual(['retener-entrada', 'crear-publicacion']);
    });

    it('copia en la publicación lo que se anuncia', async () => {
      // Un anuncio muestra lo que se anunció. Sin esta copia, listar el mercado
      // exigiría leer la tabla de Ventas en cada petición.
      const { fuente, guardadas } = fuenteDatosEscritura({ evento: evento() });
      const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config());

      await servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN);

      expect(guardadas[0]).toMatchObject({
        eventoId: EVENTO_FUTURO,
        numeroTicket: 'TCK-2026-000001',
        localidadNombre: 'General',
        precioOriginal: 250000,
      });
    });

    it('calcula la expiración a partir del inicio del evento', async () => {
      const inicio = new Date(Date.now() + 86_400_000);
      const { fuente, guardadas } = fuenteDatosEscritura({ evento: evento({ fechaInicio: inicio }) });
      const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config(1.5, 60));

      await servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN);

      // Con 60 minutos de margen, la ventana cierra una hora antes del evento.
      const guardada = guardadas[0] as { fechaExpiracion: Date };
      expect(guardada.fechaExpiracion.getTime()).toBe(inicio.getTime() - 60 * 60_000);
    });

    it('le pasa a Ventas quién dice ser el dueño, para que lo compruebe allí', async () => {
      // La propiedad no se comprueba aquí: es un dato de Ventas, y él la decide
      // en el mismo UPDATE condicionado que retiene la entrada. Comprobarla
      // antes con un SELECT dejaría una ventana entre la lectura y la escritura.
      const { fuente } = fuenteDatosEscritura({ evento: evento() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await servicio.publicar('otro-usuario', { entradaId: ENTRADA, precio: 300000 }, TOKEN);

      expect(v.marcarEnReventa).toHaveBeenCalledWith(ENTRADA, 'otro-usuario', TOKEN);
    });

    it('si Ventas no la retiene, no se crea publicación ni se compensa', async () => {
      // Cubre a la vez "no es tuya", "está usada" y "ya está publicada": las
      // tres son una negativa de Ventas, y en ninguna se escribió nada.
      const { fuente, guardadas } = fuenteDatosEscritura({ evento: evento() });
      const v = ventas({ motivo: MotivoNoRevendible.ESTADO, estadoEntrada: EstadoEntrada.USADA });
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN),
      ).rejects.toMatchObject({ response: { codigo: 'CU-006E' } });
      expect(guardadas).toHaveLength(0);
      // Nada que deshacer: compensar aquí liberaría una entrada que quizá está
      // legítimamente publicada por otra vía.
      expect(v.devolverDeReventa).not.toHaveBeenCalled();
    });

    it('devuelve la entrada si el precio supera el tope', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 400000 }, TOKEN),
      ).rejects.toMatchObject({ response: { codigo: 'PRECIO_SOBRE_TOPE', precioMaximo: 375000 } });
      // La entrada ya estaba retenida cuando se rechazó el precio: dejarla así
      // la bloquearía sin anuncio.
      expect(v.devolverDeReventa).toHaveBeenCalledWith(ENTRADA, TOKEN);
    });

    it('devuelve la entrada si el evento no permite reventa', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento({ permiteReventa: false }) });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN),
      ).rejects.toMatchObject({ response: { codigo: 'CU-006F' } });
      expect(v.devolverDeReventa).toHaveBeenCalledWith(ENTRADA, TOKEN);
    });

    it('devuelve la entrada si el evento todavía no se conoce', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: null });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN),
      ).rejects.toMatchObject({ response: { codigo: 'EVENTO_NO_CONOCIDO' } });
      expect(v.devolverDeReventa).toHaveBeenCalledWith(ENTRADA, TOKEN);
    });

    it('traduce la violación del índice único a un error del dominio y compensa', async () => {
      // El índice `uq_publicacion_activa_por_entrada` es la red de seguridad de
      // RNF-01: si salta, no es un fallo inesperado sino el motor impidiendo una
      // segunda publicación activa. El cliente debe ver eso, no un 500.
      const violacion = new QueryFailedError('INSERT', [], new Error('duplicada'));
      (violacion as unknown as { driverError: { code: string } }).driverError = { code: '23505' };
      const { fuente } = fuenteDatosEscritura({
        evento: evento(),
        alGuardar: () => {
          throw violacion;
        },
      });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN),
      ).rejects.toMatchObject({ response: { codigo: 'ENTRADA_YA_PUBLICADA' } });
      expect(v.devolverDeReventa).toHaveBeenCalledWith(ENTRADA, TOKEN);
    });

    it('no enmascara otros errores de la base', async () => {
      // Solo el 23505 significa "ya publicada". Convertir cualquier fallo en ese
      // error escondería problemas reales.
      const otro = new QueryFailedError('INSERT', [], new Error('sin conexión'));
      (otro as unknown as { driverError: { code: string } }).driverError = { code: '08006' };
      const { fuente } = fuenteDatosEscritura({
        evento: evento(),
        alGuardar: () => {
          throw otro;
        },
      });
      const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 300000 }, TOKEN),
      ).rejects.toThrow(QueryFailedError);
    });

    it('avisa del peor caso si la compensación tampoco funciona', async () => {
      // La entrada queda retenida sin publicación: nadie puede comprarla, pero
      // su dueño tampoco usarla. Es recuperable, pero hay que decirlo — un
      // error genérico dejaría al vendedor sin saber que su entrada está presa.
      const { fuente } = fuenteDatosEscritura({ evento: evento() });
      const v = ventas({ devolver: false });
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(
        servicio.publicar(VENDEDOR, { entradaId: ENTRADA, precio: 400000 }, TOKEN),
      ).rejects.toMatchObject({
        response: { codigo: 'ENTRADA_BLOQUEADA_SIN_PUBLICACION', requiereConciliacion: true },
      });
    });
  });

  describe('CU-006A — cambiar el precio', () => {
    it('acepta un precio dentro del tope', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config());

      const resultado = await servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 350000 });

      expect(resultado.precio).toBe(350000);
    });

    it('revalida el tope contra la copia del precio original', async () => {
      // Sin esta comprobación bastaría con publicar barato y subir después. Se
      // juzga contra `precio_original` de la publicación, que es la copia tomada
      // al publicar: es lo que se pagó por la entrada, y eso no cambia.
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config());

      await expect(servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 500000 })).rejects.toMatchObject({
        response: { codigo: 'PRECIO_SOBRE_TOPE' },
      });
    });

    it('no habla con Ventas: cambiar el precio es solo del anuncio', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 350000 });

      expect(v.marcarEnReventa).not.toHaveBeenCalled();
      expect(v.devolverDeReventa).not.toHaveBeenCalled();
    });

    it('rechaza cambiar el precio de una publicación ajena', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config());

      await expect(servicio.cambiarPrecio('otro', 'pub-1', { precio: 300000 })).rejects.toMatchObject({
        response: { codigo: 'NO_ES_PROPIETARIO' },
      });
    });

    it.each([EstadoPublicacion.VENDIDA, EstadoPublicacion.RETIRADA, EstadoPublicacion.EXPIRADA])(
      'rechaza cambiar el precio de una publicación %s',
      async (estado) => {
        const { fuente } = fuenteDatosEscritura({
          evento: evento(),
          publicacion: publicacionActiva({ estado }),
        });
        const servicio = new PublicacionService(fuente, ventas().cliente, concurrencia(), config());

        await expect(servicio.cambiarPrecio(VENDEDOR, 'pub-1', { precio: 300000 })).rejects.toMatchObject({
          response: { codigo: 'PUBLICACION_NO_ACTIVA' },
        });
      },
    );
  });

  describe('CU-006B — retirar del mercado', () => {
    it('cierra el anuncio y pide a Ventas que devuelva la entrada', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      const resultado = await servicio.retirar(VENDEDOR, 'pub-1', TOKEN);

      expect(resultado.estado).toBe(EstadoPublicacion.RETIRADA);
      expect(v.devolverDeReventa).toHaveBeenCalledWith(ENTRADA, TOKEN);
    });

    it('el anuncio se cierra ANTES de devolver la entrada', async () => {
      // Aquí el orden va al revés que al publicar, y por la misma razón: si se
      // devolviera primero, quedaría un anuncio activo sobre una entrada ya
      // usable, que es el caso que rompe RNF-01.
      const orden: string[] = [];
      const { fuente, gestor } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      (gestor as unknown as { save: jest.Mock }).save = jest.fn((valor: unknown) => {
        orden.push('cerrar-anuncio');
        return Promise.resolve(valor);
      });
      const v = ventas();
      v.devolverDeReventa.mockImplementation(() => {
        orden.push('devolver-entrada');
        return Promise.resolve(true);
      });
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await servicio.retirar(VENDEDOR, 'pub-1', TOKEN);

      expect(orden).toEqual(['cerrar-anuncio', 'devolver-entrada']);
    });

    it('no reabre el anuncio si la devolución falla', async () => {
      // Dejarlo retirado es lo que el vendedor pidió. Reabrirlo sería peor que
      // una entrada retenida: volvería a ofrecer algo que puede no estar.
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const servicio = new PublicacionService(fuente, ventas({ devolver: false }).cliente, concurrencia(), config());

      const resultado = await servicio.retirar(VENDEDOR, 'pub-1', TOKEN);

      expect(resultado.estado).toBe(EstadoPublicacion.RETIRADA);
    });

    it('no deja retirar una publicación que alguien está pagando', async () => {
      // El vendedor no puede sacar del mercado una entrada con un cobro en
      // vuelo: la transferencia acabaría igualmente y él creería haberla
      // retirado. Es la misma cortesía que la expiración ya tenía.
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(true), config());

      await expect(servicio.retirar(VENDEDOR, 'pub-1', TOKEN)).rejects.toMatchObject({
        response: { codigo: 'CU-006H' },
      });
      expect(v.devolverDeReventa).not.toHaveBeenCalled();
    });

    it('rechaza retirar una publicación ajena', async () => {
      const { fuente } = fuenteDatosEscritura({ evento: evento(), publicacion: publicacionActiva() });
      const v = ventas();
      const servicio = new PublicacionService(fuente, v.cliente, concurrencia(), config());

      await expect(servicio.retirar('otro', 'pub-1', TOKEN)).rejects.toMatchObject({
        response: { codigo: 'NO_ES_PROPIETARIO' },
      });
      expect(v.devolverDeReventa).not.toHaveBeenCalled();
    });
  });
});
