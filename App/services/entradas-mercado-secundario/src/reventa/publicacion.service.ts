import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio, ReglasReventa } from '../config/configuracion';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
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
  async listarEntradasPropias(usuarioId: string): Promise<EntradaPropiaDto[]> {
    const entradas = await this.fuenteDatos.getRepository(Entrada).find({
      where: { propietarioId: usuarioId },
      order: { creadaEn: 'DESC' },
    });
    if (entradas.length === 0) return [];

    const eventos = await this.eventosDe(this.fuenteDatos.manager, entradas);
    const publicaciones = await this.publicacionesActivasDe(this.fuenteDatos.manager, entradas);
    const ahora = new Date();

    return entradas.map((entrada) => {
      const evento = eventos.get(entrada.eventoId);
      const publicacion = publicaciones.get(entrada.id);
      const bloqueo = this.motivoParaNoPublicar(entrada, evento, ahora);

      return {
        id: entrada.id,
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
                entrada,
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
      .innerJoin(Entrada, 'e', 'e.id = p.entrada_id')
      .innerJoin(EventoReferencia, 'ev', 'ev.evento_id = e.evento_id')
      .where('p.estado = :estado', { estado: EstadoPublicacion.ACTIVA })
      .andWhere('p.fechaExpiracion > :ahora', { ahora: new Date() })
      .andWhere('p.vendedorId <> :usuarioId', { usuarioId });

    if (filtros.eventoId) {
      consulta.andWhere('e.evento_id = :eventoId', { eventoId: filtros.eventoId });
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

    const entradas = await gestor
      .createQueryBuilder(Entrada, 'entrada')
      .where('entrada.id IN (:...ids)', { ids: publicaciones.map((p) => p.entradaId) })
      .getMany();
    const porEntrada = new Map(entradas.map((entrada) => [entrada.id, entrada]));
    const eventos = await this.eventosDe(gestor, entradas);

    return {
      publicaciones: publicaciones.flatMap((publicacion) => {
        const entrada = porEntrada.get(publicacion.entradaId);
        const evento = entrada ? eventos.get(entrada.eventoId) : undefined;
        // El innerJoin garantiza que ambos existen; el flatMap es solo para
        // satisfacer al compilador sin un `!` que mentiría sobre la garantía.
        return entrada && evento ? [aPublicacionMercadoDto(publicacion, entrada, evento, usuarioId)] : [];
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

    const entrada = await gestor.findOneBy(Entrada, { id: publicacion.entradaId });
    if (!entrada) throw new EntradaNoEncontrada(publicacion.entradaId);

    const evento = await gestor.findOneBy(EventoReferencia, { eventoId: entrada.eventoId });
    if (!evento) throw new EventoNoConocido(entrada.eventoId);

    return aPublicacionMercadoDto(publicacion, entrada, evento, usuarioId);
  }

  /**
   * Pasos 2-4 del CU-006: validar que la entrada pueda revenderse y publicarla.
   *
   * Todo ocurre en una transacción porque publicar son dos escrituras que no
   * pueden separarse: crear la publicación y marcar la entrada como
   * `EN_REVENTA`. Si solo pasara la primera, la entrada estaría en el mercado
   * diciendo de sí misma que está `VALIDA`.
   */
  async publicar(usuarioId: string, datos: PublicarEntradaDto): Promise<PublicacionDto> {
    return this.fuenteDatos.transaction(async (gestor) => {
      // FOR UPDATE sobre la entrada: serializa dos intentos de publicar la
      // MISMA entrada. No es el bloqueo del checkout (ese es de Redis, ADR-03,
      // y llega en el paso 5) — aquí la contención es rarísima (una persona
      // pulsando "Publicar" dos veces) y dura lo que dura la transacción, así
      // que un lock de fila es la herramienta proporcionada.
      const entrada = await gestor.findOne(Entrada, {
        where: { id: datos.entradaId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entrada) throw new EntradaNoEncontrada(datos.entradaId);

      // La propiedad se comprueba contra la base, nunca contra lo que diga el
      // cliente (pre-condición 1 del CU-006).
      if (entrada.propietarioId !== usuarioId) throw new NoEsPropietario();

      const evento = await gestor.findOneBy(EventoReferencia, { eventoId: entrada.eventoId });
      this.exigirRevendible(entrada, evento, new Date());

      // `evento` no puede ser null aquí: exigirRevendible ya lo habría
      // rechazado con EventoNoConocido.
      const eventoValidado = evento as EventoReferencia;

      const maximo = this.precioMaximo(entrada.precioOriginal);
      if (datos.precio > maximo) {
        throw new PrecioSobreTope(datos.precio, entrada.precioOriginal, this.reglas.topePrecioFactor);
      }

      const fechaExpiracion = this.fechaExpiracion(eventoValidado.fechaInicio);

      let publicacion: PublicacionReventa;
      try {
        publicacion = await gestor.save(
          gestor.create(PublicacionReventa, {
            entradaId: entrada.id,
            vendedorId: usuarioId,
            precio: datos.precio,
            precioOriginal: entrada.precioOriginal,
            estado: EstadoPublicacion.ACTIVA,
            fechaExpiracion,
          }),
        );
      } catch (error) {
        // El índice único parcial `uq_publicacion_activa_por_entrada` es la red
        // de seguridad de RNF-01. Si salta, no es un fallo inesperado: es el
        // motor impidiendo una segunda publicación activa de la misma entrada.
        if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === VIOLACION_UNICIDAD) {
          throw new EntradaYaPublicada();
        }
        throw error;
      }

      await gestor.update(Entrada, { id: entrada.id }, { estado: EstadoEntrada.EN_REVENTA });

      this.log.log(`Entrada ${entrada.numeroTicket} publicada por ${usuarioId} a ${datos.precio}`);
      return aPublicacionDto(
        publicacion,
        entrada,
        eventoValidado.nombre,
        eventoValidado.lugar,
        eventoValidado.fechaInicio,
        maximo,
      );
    });
  }

  /** Flujo alterno **CU-006A**: cambiar el precio antes de que la compren. */
  async cambiarPrecio(usuarioId: string, publicacionId: string, datos: CambiarPrecioDto): Promise<PublicacionDto> {
    return this.fuenteDatos.transaction(async (gestor) => {
      const { publicacion, entrada, evento } = await this.cargarPublicacionDelVendedor(gestor, usuarioId, publicacionId);

      const maximo = this.precioMaximo(entrada.precioOriginal);
      if (datos.precio > maximo) {
        throw new PrecioSobreTope(datos.precio, entrada.precioOriginal, this.reglas.topePrecioFactor);
      }

      // El tope se revalida aquí y no solo al publicar: si no, bastaría con
      // publicar barato y subir el precio después para saltárselo entero.
      publicacion.precio = datos.precio;
      await gestor.save(publicacion);

      this.log.log(`Publicación ${publicacionId} cambia de precio a ${datos.precio}`);
      return aPublicacionDto(publicacion, entrada, evento.nombre, evento.lugar, evento.fechaInicio, maximo);
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
  async retirar(usuarioId: string, publicacionId: string): Promise<PublicacionDto> {
    if ((await this.concurrencia.tiempoRestanteMs(publicacionId)) !== null) {
      throw new PublicacionEnCheckout();
    }

    return this.fuenteDatos.transaction(async (gestor) => {
      const { publicacion, entrada, evento } = await this.cargarPublicacionDelVendedor(gestor, usuarioId, publicacionId);

      publicacion.estado = EstadoPublicacion.RETIRADA;
      publicacion.fechaCierre = new Date();
      await gestor.save(publicacion);

      // La entrada vuelve a ser del vendedor sin más: retirar no transfiere
      // nada, así que no genera QR nuevo ni fila de historial. El historial
      // registra cambios de propietario, y aquí no ha cambiado nadie.
      await gestor.update(Entrada, { id: entrada.id }, { estado: EstadoEntrada.VALIDA });

      this.log.log(`Publicación ${publicacionId} retirada del mercado`);
      return aPublicacionDto(
        publicacion,
        entrada,
        evento.nombre,
        evento.lugar,
        evento.fechaInicio,
        this.precioMaximo(entrada.precioOriginal),
      );
    });
  }

  // --- Apoyo -------------------------------------------------------------

  /** Carga una publicación comprobando que sea del vendedor y siga admitiendo cambios. */
  private async cargarPublicacionDelVendedor(
    gestor: EntityManager,
    usuarioId: string,
    publicacionId: string,
  ): Promise<{ publicacion: PublicacionReventa; entrada: Entrada; evento: EventoReferencia }> {
    const publicacion = await gestor.findOne(PublicacionReventa, {
      where: { id: publicacionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!publicacion) throw new PublicacionNoEncontrada(publicacionId);
    if (publicacion.vendedorId !== usuarioId) throw new NoEsPropietario();
    if (publicacion.estado !== EstadoPublicacion.ACTIVA) throw new PublicacionNoActiva(publicacion.estado);

    const entrada = await gestor.findOneBy(Entrada, { id: publicacion.entradaId });
    if (!entrada) throw new EntradaNoEncontrada(publicacion.entradaId);

    const evento = await gestor.findOneBy(EventoReferencia, { eventoId: entrada.eventoId });
    if (!evento) throw new EventoNoConocido(entrada.eventoId);

    return { publicacion, entrada, evento };
  }

  /**
   * Paso 2 del CU-006: *"Validar que la entrada pueda revenderse (propiedad,
   * estado y políticas del evento)"*. Lanza el error del camino que corresponda.
   */
  private exigirRevendible(entrada: Entrada, evento: EventoReferencia | null, ahora: Date): void {
    if (!evento) throw new EventoNoConocido(entrada.eventoId);

    if (entrada.estado === EstadoEntrada.EN_REVENTA) throw new EntradaYaPublicada();
    // Pre-condición 2 y camino CU-006E.
    if (entrada.estado !== EstadoEntrada.VALIDA) throw new EntradaNoRevendible(entrada.estado);
    // Pre-condición 3 y camino CU-006F.
    if (!evento.permiteReventa) throw new EventoSinReventa();

    const expiracion = this.fechaExpiracion(evento.fechaInicio);
    if (expiracion <= ahora) throw new VentanaReventaCerrada(expiracion);
  }

  /** Misma validación que `exigirRevendible`, pero devolviendo el motivo en vez de lanzarlo. */
  private motivoParaNoPublicar(entrada: Entrada, evento: EventoReferencia | undefined, ahora: Date): Bloqueo | null {
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

  private async eventosDe(gestor: EntityManager, entradas: Entrada[]): Promise<Map<string, EventoReferencia>> {
    const ids = [...new Set(entradas.map((e) => e.eventoId))];
    const eventos = await gestor
      .createQueryBuilder(EventoReferencia, 'evento')
      .where('evento.evento_id IN (:...ids)', { ids })
      .getMany();
    return new Map(eventos.map((evento) => [evento.eventoId, evento]));
  }

  private async publicacionesActivasDe(
    gestor: EntityManager,
    entradas: Entrada[],
  ): Promise<Map<string, PublicacionReventa>> {
    const ids = entradas.map((e) => e.id);
    const publicaciones = await gestor
      .createQueryBuilder(PublicacionReventa, 'publicacion')
      .where('publicacion.entrada_id IN (:...ids)', { ids })
      .andWhere('publicacion.estado = :estado', { estado: EstadoPublicacion.ACTIVA })
      .getMany();
    return new Map(publicaciones.map((publicacion) => [publicacion.entradaId, publicacion]));
  }
}
