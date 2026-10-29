import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio, ReglasReventa } from '../config/configuracion';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import {
  ClienteVentas,
  EntradaPropia,
  EstadoEntrada,
  MotivoNoRevendible,
} from './cliente-ventas.service';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import {
  ConsultarMercadoDto,
  MercadoDto,
  OrdenMercado,
  PublicacionMercadoDto,
  aPublicacionMercadoDto,
} from './dto/mercado.dto';
import {
  CambiarPrecioDto,
  EntradaPropiaDto,
  PublicacionDto,
  PublicarEntradaDto,
  aPublicacionDto,
} from './dto/publicacion.dto';
import {
  EntradaBloqueadaSinPublicacion,
  EntradaNoEncontrada,
  EntradaNoRevendible,
  EntradaYaPublicada,
  EventoNoConocido,
  EventoSinReventa,
  NoEsPropietario,
  PrecioSobreTope,
  PublicacionEnCheckout,
  PublicacionNoActiva,
  PublicacionNoEncontrada,
  VentanaReventaCerrada,
  VentasNoDisponible,
} from './reventa.errors';

/** Código de PostgreSQL para violación de restricción única. */
const VIOLACION_UNICIDAD = '23505';

/** Motivo por el que una entrada no puede publicarse, con el código del camino del CU-006. */
interface Bloqueo {
  codigo: string;
  detalle: string;
}

/**
 * Servicio de Publicación (SAD §9).
 *
 * En la vista de componentes es el que *"orquesta la reventa"*: el Controlador
 * API le delega y él coordina al resto. En este paso solo cubre la mitad del
 * vendedor —publicar, cambiar el precio y retirar (pasos 1-4 del flujo básico
 * y los alternos CU-006A/CU-006B)—; la del comprador (bloqueo, pago y
 * transferencia) llega en los pasos siguientes.
 */
@Injectable()
export class PublicacionService {
  private readonly log = new Logger(PublicacionService.name);
  private readonly reglas: ReglasReventa;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly ventas: ClienteVentas,
    private readonly concurrencia: GestorConcurrencia,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.reventa;
  }

  /**
   * Paso 1 del CU-006: las entradas de la cuenta del vendedor, con el veredicto
   * de si cada una puede publicarse y por qué no.
   *
   * Devolver el veredicto ya calculado —en vez de los datos crudos para que el
   * cliente decida— es lo que evita duplicar las reglas de reventa en el móvil
   * y en el portal (RNF-14: *"0 reglas de negocio duplicadas en el cliente"*).
   */
  async listarEntradasPropias(usuarioId: string, tokenSesion: string): Promise<EntradaPropiaDto[]> {
    // Las entradas se las pide a Ventas: la pregunta *¿qué entradas son mías?*
    // es de su dominio desde ADR-14. Lo que Postventa añade es el veredicto.
    const entradas = await this.ventas.entradasDe(usuarioId, tokenSesion);
    if (entradas === null) throw new VentasNoDisponible('el servicio de entradas no respondió');
    if (entradas.length === 0) return [];

    const eventos = await this.eventosDe(
      this.fuenteDatos.manager,
      entradas.map((e) => e.eventoId),
    );
    const publicaciones = await this.publicacionesActivasDe(
      this.fuenteDatos.manager,
      entradas.map((e) => e.entradaId),
    );
    const ahora = new Date();

    return entradas.map((entrada) => {
      const evento = eventos.get(entrada.eventoId);
      const publicacion = publicaciones.get(entrada.entradaId);
      const bloqueo = this.motivoParaNoPublicar(entrada, evento, ahora);

      return {
        id: entrada.entradaId,
        numeroTicket: entrada.numeroTicket,
        eventoId: entrada.eventoId,
        eventoNombre: evento?.nombre ?? 'Evento desconocido',
        lugar: evento?.lugar ?? '',
        localidadNombre: entrada.localidadNombre,
        precioOriginal: entrada.precioOriginal,
        estado: entrada.estado,
        fechaEvento: (evento?.fechaInicio ?? ahora).toISOString(),
        puedePublicarse: bloqueo === null,
        motivoBloqueo: bloqueo?.codigo,
        detalleBloqueo: bloqueo?.detalle,
        precioMaximo: this.precioMaximo(entrada.precioOriginal),
        publicacion:
          publicacion && evento
            ? aPublicacionDto(
                publicacion,
                evento.nombre,
                evento.lugar,
                evento.fechaInicio,
                this.precioMaximo(entrada.precioOriginal),
              )
            : undefined,
      };
    });
  }

  /**
   * Paso 5 del CU-006: *"El comprador consulta las entradas disponibles"*.
   *
   * Tres reglas se aplican aquí y no en el cliente, porque son de dominio:
   *
   * 1. **Solo publicaciones ACTIVAS.** Las vendidas, retiradas o expiradas no
   *    se muestran.
   * 2. **Solo dentro de la ventana de reventa.** Una publicación cuya
   *    `fecha_expiracion` ya pasó sigue marcada `ACTIVA` en la base hasta que
   *    el trabajo de expiración (CU-006D, paso 8) la cierre. Filtrar por fecha
   *    además de por estado evita ofrecer algo que no se puede comprar durante
   *    esa ventana.
   * 3. **Nunca las del propio solicitante.** Nadie se compra su propia entrada.
   */
  async consultarMercado(usuarioId: string, filtros: ConsultarMercadoDto): Promise<MercadoDto> {
    const limite = filtros.limite ?? 20;
    const desplazamiento = filtros.desplazamiento ?? 0;
    const orden = filtros.orden ?? OrdenMercado.RECIENTES;
    const gestor = this.fuenteDatos.manager;

    const consulta = gestor
      .createQueryBuilder(PublicacionReventa, 'p')
      // Antes aquí había también un `innerJoin` a `entradas`. Ya no: esa tabla
      // vive en la base de Ventas desde ADR-14, y lo que el listado necesitaba
      // de ella —evento y localidad— lo lleva la propia publicación. El join
      // que queda es a `eventos_referencia`, que es una proyección local.
      .innerJoin(EventoReferencia, 'ev', 'ev.evento_id = p.evento_id')
      .where('p.estado = :estado', { estado: EstadoPublicacion.ACTIVA })
      .andWhere('p.fechaExpiracion > :ahora', { ahora: new Date() })
      .andWhere('p.vendedorId <> :usuarioId', { usuarioId });

    if (filtros.eventoId) {
      consulta.andWhere('p.evento_id = :eventoId', { eventoId: filtros.eventoId });
    }

    switch (orden) {
      case OrdenMercado.PRECIO_ASC:
        consulta.orderBy('p.precio', 'ASC');
        break;
      case OrdenMercado.PRECIO_DESC:
        consulta.orderBy('p.precio', 'DESC');
        break;
      case OrdenMercado.EVENTO_PROXIMO:
        // El `addSelect` no es decorativo. `skip`/`take` hacen que TypeORM
        // pagine con una subconsulta `SELECT DISTINCT` que solo arrastra las
        // columnas de `p`; ordenar por una columna del join que no viaja en
        // esa lista rompe con «column distinctAlias.ev_fecha_inicio does not
        // exist». Seleccionarla la mete en la subconsulta y el ORDER BY la
        // encuentra. El alias tiene que ser el que TypeORM compone
        // (`<alias>_<columna>`), o el nombre tampoco coincidiría.
        consulta.addSelect('ev.fecha_inicio', 'ev_fecha_inicio').orderBy('ev.fecha_inicio', 'ASC');
        break;
      default:
        consulta.orderBy('p.fechaPublicacion', 'DESC');
    }
    // Desempate estable: sin él, dos publicaciones con el mismo precio pueden
    // salir en distinto orden entre páginas y el comprador vería una repetida
    // o se saltaría otra al pasar de página.
    consulta.addOrderBy('p.id', 'ASC');

    const [publicaciones, total] = await consulta.skip(desplazamiento).take(limite).getManyAndCount();
    if (publicaciones.length === 0) {
      return { publicaciones: [], total, limite, desplazamiento };
    }

    const eventos = await this.eventosDe(
      gestor,
      publicaciones.map((p) => p.eventoId),
    );

    return {
      publicaciones: publicaciones.flatMap((publicacion) => {
        const evento = eventos.get(publicacion.eventoId);
        // El innerJoin garantiza que existe; el flatMap es solo para satisfacer
        // al compilador sin un `!` que mentiría sobre la garantía.
        return evento ? [aPublicacionMercadoDto(publicacion, evento, usuarioId)] : [];
      }),
      total,
      limite,
      desplazamiento,
    };
  }

  /**
   * Detalle de una publicación — la otra mitad del paso 5: *"y selecciona una
   * para comprar"*.
   *
   * A diferencia del listado, aquí **sí** se devuelven las publicaciones que ya
   * no están activas, con su estado. Si el comprador tenía la pantalla abierta
   * y entretanto otra persona la compró, es mejor decirle "ya se vendió" que
   * un 404 que parece un error de la app.
   */
  async detallePublicacion(usuarioId: string, publicacionId: string): Promise<PublicacionMercadoDto> {
    const gestor = this.fuenteDatos.manager;
    const publicacion = await gestor.findOneBy(PublicacionReventa, { id: publicacionId });
    if (!publicacion) throw new PublicacionNoEncontrada(publicacionId);

    const evento = await gestor.findOneBy(EventoReferencia, { eventoId: publicacion.eventoId });
    if (!evento) throw new EventoNoConocido(publicacion.eventoId);

    return aPublicacionMercadoDto(publicacion, evento, usuarioId);
  }

  /**
   * Pasos 2-4 del CU-006: validar que la entrada pueda revenderse y publicarla.
   *
   * ## Por qué ya no es una transacción
   *
   * Antes esto eran dos escrituras en una misma transacción: crear la
   * publicación y poner la entrada `EN_REVENTA`. Desde ADR-14 la entrada vive
   * en la base de Ventas, y no hay transacción que abarque las dos. Es la
   * consecuencia que el ADR-01 ya anunciaba al separar las bases, y aquí se
   * paga con una Saga.
   *
   * ## Por qué la entrada se bloquea primero
   *
   * El orden está elegido, no heredado. Si se creara la publicación primero,
   * existiría un anuncio sobre una entrada todavía `VALIDA`: su dueño podría
   * entrar al evento con ella mientras alguien la compra, y acabaríamos con una
   * entrada vendida y ya usada. Eso rompería el RNF-01.
   *
   * En este orden el peor caso es el contrario y es mucho más barato: una
   * entrada retenida sin anuncio. Nadie puede comprarla, nadie puede usarla, y
   * se arregla devolviéndola — que es justo lo que hace la compensación.
   *
   * ## Qué comprueba quién
   *
   * Ventas decide *de quién es* y *si está disponible*, en un solo `UPDATE`
   * condicionado; son datos suyos y comprobarlos aquí sería adivinar. Postventa
   * decide lo que es suyo: la política de reventa del evento y el tope de
   * precio. Por eso las reglas del evento se validan **después** de bloquear:
   * hasta que Ventas no contesta no se sabe ni de qué evento es la entrada.
   */
  async publicar(usuarioId: string, datos: PublicarEntradaDto, tokenSesion: string): Promise<PublicacionDto> {
    // Paso 1: Ventas retiene la entrada. Si dice que no, no se ha escrito nada
    // en ninguna parte y no hay nada que compensar — pero sí hay que decir cuál
    // de los caminos del CU-006 se tomó.
    const retencion = await this.ventas.marcarEnReventa(datos.entradaId, usuarioId, tokenSesion);
    if (!retencion.marcada) throw this.porQueNoSeRetuvo(datos.entradaId, retencion);
    const entrada = retencion.entrada;

    try {
      // Paso 2: las reglas que sí son de Postventa.
      const evento = await this.fuenteDatos.manager.findOneBy(EventoReferencia, { eventoId: entrada.eventoId });
      if (!evento) throw new EventoNoConocido(entrada.eventoId);
      this.exigirEventoRevendible(evento, new Date());

      const maximo = this.precioMaximo(entrada.precioOriginal);
      if (datos.precio > maximo) {
        throw new PrecioSobreTope(datos.precio, entrada.precioOriginal, this.reglas.topePrecioFactor);
      }

      // Paso 3: el anuncio, con su copia de lo que anuncia.
      const publicacion = await this.crearPublicacion(entrada, usuarioId, datos.precio, evento.fechaInicio);

      this.log.log(`Entrada ${entrada.numeroTicket} publicada por ${usuarioId} a ${datos.precio}`);
      return aPublicacionDto(publicacion, evento.nombre, evento.lugar, evento.fechaInicio, maximo);
    } catch (error) {
      // Compensación: la entrada quedó retenida y no hay anuncio. Devolverla es
      // seguro precisamente por el orden elegido — como no existe publicación,
      // nadie pudo comprarla mientras tanto.
      const devuelta = await this.ventas.devolverDeReventa(datos.entradaId, tokenSesion);
      if (!devuelta) {
        this.log.error(
          `Entrada ${datos.entradaId} retenida EN_REVENTA sin publicación: la compensación falló. ` +
            `Causa original: ${(error as Error).message}`,
        );
        throw new EntradaBloqueadaSinPublicacion(datos.entradaId);
      }
      throw error;
    }
  }

  /**
   * Traduce la negativa de Ventas al error del camino que corresponda.
   *
   * No se colapsan en un 409 genérico porque la ficha del CU-006 los separa:
   * "no es tuya" es la pre-condición 1 y es un 403, "usada o anulada" es el
   * camino CU-006E y es un 409. Al vendedor le sirven respuestas distintas.
   */
  private porQueNoSeRetuvo(
    entradaId: string,
    retencion: { motivo: MotivoNoRevendible; estado?: string },
  ): Error {
    switch (retencion.motivo) {
      case MotivoNoRevendible.NO_EXISTE:
        return new EntradaNoEncontrada(entradaId);
      case MotivoNoRevendible.NO_ES_SUYA:
        return new NoEsPropietario();
      case MotivoNoRevendible.SIN_RESPUESTA:
        return new VentasNoDisponible('el servicio de entradas no respondió');
      default:
        // `EN_REVENTA` tiene su propio error: "ya está publicada" es un camino
        // distinto de "está usada", y el vendedor puede actuar sobre el primero.
        if (retencion.estado === EstadoEntrada.EN_REVENTA) return new EntradaYaPublicada();
        return new EntradaNoRevendible(retencion.estado ?? 'no disponible');
    }
  }

  /**
   * Inserta la publicación con su copia de los datos del anuncio.
   *
   * El índice único parcial `uq_publicacion_activa_por_entrada` es la red de
   * seguridad de RNF-01: si salta, no es un fallo inesperado, es el motor
   * impidiendo un segundo anuncio activo de la misma entrada.
   */
  private async crearPublicacion(
    entrada: { entradaId: string; eventoId: string; numeroTicket: string; localidadNombre: string; precioOriginal: number },
    vendedorId: string,
    precio: number,
    fechaInicioEvento: Date,
  ): Promise<PublicacionReventa> {
    const gestor = this.fuenteDatos.manager;
    try {
      return await gestor.save(
        gestor.create(PublicacionReventa, {
          entradaId: entrada.entradaId,
          vendedorId,
          precio,
          precioOriginal: entrada.precioOriginal,
          eventoId: entrada.eventoId,
          numeroTicket: entrada.numeroTicket,
          localidadNombre: entrada.localidadNombre,
          estado: EstadoPublicacion.ACTIVA,
          fechaExpiracion: this.fechaExpiracion(fechaInicioEvento),
        }),
      );
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === VIOLACION_UNICIDAD) {
        throw new EntradaYaPublicada();
      }
      throw error;
    }
  }

  /** Flujo alterno **CU-006A**: cambiar el precio antes de que la compren. */
  async cambiarPrecio(usuarioId: string, publicacionId: string, datos: CambiarPrecioDto): Promise<PublicacionDto> {
    return this.fuenteDatos.transaction(async (gestor) => {
      const { publicacion, evento } = await this.cargarPublicacionDelVendedor(gestor, usuarioId, publicacionId);

      // Se revalida contra `precio_original` de la publicación, que es la copia
      // tomada al publicar. Es la referencia correcta: el tope se juzga contra
      // lo que se pagó por la entrada, y eso no cambia.
      const maximo = this.precioMaximo(publicacion.precioOriginal);
      if (datos.precio > maximo) {
        throw new PrecioSobreTope(datos.precio, publicacion.precioOriginal, this.reglas.topePrecioFactor);
      }

      // El tope se revalida aquí y no solo al publicar: si no, bastaría con
      // publicar barato y subir el precio después para saltárselo entero.
      publicacion.precio = datos.precio;
      await gestor.save(publicacion);

      this.log.log(`Publicación ${publicacionId} cambia de precio a ${datos.precio}`);
      return aPublicacionDto(publicacion, evento.nombre, evento.lugar, evento.fechaInicio, maximo);
    });
  }

  /**
   * Flujo alterno **CU-006B**: retirar la entrada del mercado secundario.
   *
   * No se puede retirar mientras alguien la está pagando. El `FOR UPDATE` sobre
   * la fila protege de dos escrituras a la vez en Postgres, pero no sabe nada
   * del bloqueo de Redis: sin esta comprobación, el vendedor podía retirar una
   * publicación con un cobro en vuelo y acabar con la entrada vendida de todos
   * modos, sin ningún error de por medio.
   *
   * Es la misma cortesía que ya tenía la expiración (CU-006D) con los checkouts
   * en curso; faltaba aquí.
   */
  async retirar(usuarioId: string, publicacionId: string, tokenSesion: string): Promise<PublicacionDto> {
    if ((await this.concurrencia.tiempoRestanteMs(publicacionId)) !== null) {
      throw new PublicacionEnCheckout();
    }

    // Igual que al publicar, el orden importa y va al revés: aquí se cierra el
    // anuncio PRIMERO y se devuelve la entrada después. Si se devolviera antes,
    // quedaría un anuncio activo sobre una entrada ya usable, que es el caso que
    // rompe el RNF-01. Cerrando primero, el peor caso vuelve a ser la entrada
    // retenida sin anuncio: recuperable.
    const { publicacion, evento } = await this.fuenteDatos.transaction(async (gestor) => {
      const cargada = await this.cargarPublicacionDelVendedor(gestor, usuarioId, publicacionId);
      cargada.publicacion.estado = EstadoPublicacion.RETIRADA;
      cargada.publicacion.fechaCierre = new Date();
      await gestor.save(cargada.publicacion);
      return cargada;
    });

    // La entrada vuelve a ser usable por su dueño. Retirar no transfiere nada,
    // así que Ventas no genera QR nuevo ni fila de historial: el historial
    // registra cambios de propietario, y aquí no ha cambiado nadie.
    //
    // `devolverDeReventa` ya registra el fallo a nivel de error si no lo
    // consigue. No se revierte el cierre del anuncio: dejarlo retirado es lo
    // que el vendedor pidió, y reabrirlo sería peor que una entrada retenida.
    await this.ventas.devolverDeReventa(publicacion.entradaId, tokenSesion);

    this.log.log(`Publicación ${publicacionId} retirada del mercado`);
    return aPublicacionDto(
      publicacion,
      evento.nombre,
      evento.lugar,
      evento.fechaInicio,
      this.precioMaximo(publicacion.precioOriginal),
    );
  }

  // --- Apoyo -------------------------------------------------------------

  /** Carga una publicación comprobando que sea del vendedor y siga admitiendo cambios. */
  private async cargarPublicacionDelVendedor(
    gestor: EntityManager,
    usuarioId: string,
    publicacionId: string,
  ): Promise<{ publicacion: PublicacionReventa; evento: EventoReferencia }> {
    const publicacion = await gestor.findOne(PublicacionReventa, {
      where: { id: publicacionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!publicacion) throw new PublicacionNoEncontrada(publicacionId);
    if (publicacion.vendedorId !== usuarioId) throw new NoEsPropietario();
    if (publicacion.estado !== EstadoPublicacion.ACTIVA) throw new PublicacionNoActiva(publicacion.estado);

    const evento = await gestor.findOneBy(EventoReferencia, { eventoId: publicacion.eventoId });
    if (!evento) throw new EventoNoConocido(publicacion.eventoId);

    return { publicacion, evento };
  }

  /**
   * Paso 2 del CU-006: *"Validar que la entrada pueda revenderse (propiedad,
   * estado y políticas del evento)"*. Lanza el error del camino que corresponda.
   */
  private exigirRevendible(entrada: EntradaPropia, evento: EventoReferencia | null, ahora: Date): void {
    if (!evento) throw new EventoNoConocido(entrada.eventoId);

    // Parte del estado. Es informativa: la autoridad es Ventas, que la vuelve a
    // comprobar al retener la entrada. Sirve para explicar en el paso 1 *por
    // qué* una entrada no se puede publicar, sin tener que intentarlo.
    if (entrada.estado === EstadoEntrada.EN_REVENTA) throw new EntradaYaPublicada();
    // Pre-condición 2 y camino CU-006E.
    if (entrada.estado !== EstadoEntrada.VALIDA) throw new EntradaNoRevendible(entrada.estado);

    this.exigirEventoRevendible(evento, ahora);
  }

  /**
   * La mitad de la validación que es de Postventa: la política de reventa del
   * evento y su ventana de cierre. No mira el estado de la entrada, porque de
   * eso manda Ventas.
   */
  private exigirEventoRevendible(evento: EventoReferencia, ahora: Date): void {
    // Pre-condición 3 y camino CU-006F.
    if (!evento.permiteReventa) throw new EventoSinReventa();

    const expiracion = this.fechaExpiracion(evento.fechaInicio);
    if (expiracion <= ahora) throw new VentanaReventaCerrada(expiracion);
  }

  /** Misma validación que `exigirRevendible`, pero devolviendo el motivo en vez de lanzarlo. */
  private motivoParaNoPublicar(entrada: EntradaPropia, evento: EventoReferencia | undefined, ahora: Date): Bloqueo | null {
    try {
      this.exigirRevendible(entrada, evento ?? null, ahora);
      return null;
    } catch (error) {
      const respuesta = (error as { getResponse?: () => unknown }).getResponse?.();
      const cuerpo = respuesta as { codigo?: string; mensaje?: string } | undefined;
      return {
        codigo: cuerpo?.codigo ?? 'NO_PUBLICABLE',
        detalle: cuerpo?.mensaje ?? 'La entrada no puede publicarse',
      };
    }
  }

  /** Tope de precio de reventa (DECISIONES.md §1). Se redondea hacia abajo al centavo. */
  private precioMaximo(precioOriginal: number): number {
    return Math.floor(precioOriginal * this.reglas.topePrecioFactor * 100) / 100;
  }

  /**
   * Cuándo deja de poder venderse la publicación (CU-006D, DECISIONES.md §3):
   * el inicio del evento, menos el margen de cierre configurado.
   */
  private fechaExpiracion(fechaInicioEvento: Date): Date {
    return new Date(fechaInicioEvento.getTime() - this.reglas.margenCierreMinutos * 60_000);
  }

  private async eventosDe(gestor: EntityManager, eventoIds: string[]): Promise<Map<string, EventoReferencia>> {
    const ids = [...new Set(eventoIds)];
    const eventos = await gestor
      .createQueryBuilder(EventoReferencia, 'evento')
      .where('evento.evento_id IN (:...ids)', { ids })
      .getMany();
    return new Map(eventos.map((evento) => [evento.eventoId, evento]));
  }

  private async publicacionesActivasDe(
    gestor: EntityManager,
    entradaIds: string[],
  ): Promise<Map<string, PublicacionReventa>> {
    const ids = entradaIds;
    const publicaciones = await gestor
      .createQueryBuilder(PublicacionReventa, 'publicacion')
      .where('publicacion.entrada_id IN (:...ids)', { ids })
      .andWhere('publicacion.estado = :estado', { estado: EstadoPublicacion.ACTIVA })
      .getMany();
    return new Map(publicaciones.map((publicacion) => [publicacion.entradaId, publicacion]));
  }
}
