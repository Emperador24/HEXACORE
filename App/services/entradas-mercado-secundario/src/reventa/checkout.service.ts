import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio, ReglasReventa } from '../config/configuracion';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import {
  HistorialPropietario,
  MotivoCambioPropietario,
} from '../persistencia/entidades/historial-propietario.entity';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import { EstadoTransaccion, TransaccionReventa } from '../persistencia/entidades/transaccion-reventa.entity';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { repartir } from './dinero';
import { CheckoutDto, aCheckoutDto } from './dto/checkout.dto';
import { aPublicacionMercadoDto } from './dto/mercado.dto';
import { EntradaTransferida } from './eventos/entrada-transferida.evento';
import { PublicadorEventos } from './eventos/publicador-eventos.service';
import { EVENTO_ENTRADA_TRANSFERIDA, VERSION_ENTRADA_TRANSFERIDA } from './eventos/topologia';
import { PagarDto, ResultadoCompraDto, aResultadoCompraDto } from './dto/pagar.dto';
import { PROCESADOR_PAGOS, ProcesadorPagos, ResultadoCobro } from './pagos/procesador-pagos';
import { GeneradorQr } from './qr/generador-qr.service';
import {
  CheckoutNoEncontrado,
  CheckoutNoVigente,
  EntradaNoEncontrada,
  EventoNoConocido,
  CobradoSinTransferir,
  NoPuedeComprarSuPropiaEntrada,
  PagoIndeterminado,
  PagoRechazado,
  PublicacionEnCheckout,
  PublicacionNoActiva,
  PublicacionNoEncontrada,
  VentanaReventaCerrada,
} from './reventa.errors';

/**
 * Checkout de una compra en el mercado secundario.
 *
 * Cubre los **pasos 6 a 11** del CU-006 —bloquear, cobrar, transferir la
 * propiedad, invalidar y reemitir el QR, y registrar el historial— junto con
 * los caminos **CU-006C** (cancelar), **CU-006G** (pago rechazado), **CU-006H**
 * (dos compradores a la vez) y **CU-006I** (la pasarela no responde).
 *
 * Los pasos 12 y 13 —notificar y liquidar— son asíncronos por diseño: al
 * cerrarse la venta se publica `ENTRADA_TRANSFERIDA` en RabbitMQ (ADR-10) y
 * cada uno lo recoge por su cuenta, fuera del camino de respuesta.
 *
 * ## Por qué el bloqueo y la transacción son dos cosas distintas
 *
 * El bloqueo vive en **Redis** con TTL; la transacción, en **PostgreSQL**. La
 * tentación de guardar también en la base un estado "en checkout" es fuerte y
 * sería un error: si el proceso muere a mitad, el TTL de Redis libera la
 * publicación solo, mientras que una columna en Postgres se quedaría marcada
 * para siempre y haría falta un trabajo de limpieza.
 *
 * La consecuencia es que **la única fuente de verdad sobre si un checkout sigue
 * vivo es Redis**, no el estado `PENDIENTE` de la transacción. Por eso, antes
 * de dejar continuar un checkout, siempre se comprueba que el bloqueo siga
 * siendo suyo.
 */
@Injectable()
export class CheckoutService {
  private readonly log = new Logger(CheckoutService.name);
  private readonly reglas: ReglasReventa;

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly concurrencia: GestorConcurrencia,
    private readonly qr: GeneradorQr,
    private readonly publicador: PublicadorEventos,
    @Inject(PROCESADOR_PAGOS) private readonly pagos: ProcesadorPagos,
    @Inject(CONFIGURACION) config: ConfiguracionServicio,
  ) {
    this.reglas = config.reventa;
  }

  /**
   * Paso 6 del CU-006: reserva la publicación para este comprador.
   *
   * El orden importa y no es arbitrario:
   *
   * 1. Se valida contra la base **antes** de bloquear, para no dejar un
   *    bloqueo puesto sobre algo que de todos modos se iba a rechazar.
   * 2. Se toma el bloqueo en Redis.
   * 3. Se **vuelve a validar** ya con el bloqueo en la mano. Entre los pasos 1
   *    y 2 caben milisegundos en los que el vendedor pudo retirar la
   *    publicación; sin esta segunda comprobación, ese checkout seguiría
   *    adelante sobre una publicación retirada.
   * 4. Si algo falla a partir de aquí, se libera el bloqueo. No dejarlo puesto
   *    es lo que evita que un fallo transitorio congele la publicación durante
   *    los dos minutos enteros del TTL.
   */
  async iniciar(compradorId: string, publicacionId: string): Promise<CheckoutDto> {
    const gestor = this.fuenteDatos.manager;
    const contexto = await this.cargarPublicacion(gestor, publicacionId);
    this.exigirComprable(contexto.publicacion, compradorId);

    // El id de la transacción es también el testigo del bloqueo. Se genera
    // antes de bloquear porque hay que saber con qué valor bloquear, y eso es
    // lo que luego permite liberar solo lo propio.
    const transaccionId = crypto.randomUUID();
    const bloqueo = await this.concurrencia.bloquear(publicacionId, transaccionId);

    if (!bloqueo.adquirido) {
      return this.resolverBloqueoAjeno(gestor, compradorId, publicacionId, bloqueo.titularActual);
    }

    try {
      // Segunda validación, ya con el bloqueo tomado.
      const actual = await this.cargarPublicacion(gestor, publicacionId);
      this.exigirComprable(actual.publicacion, compradorId);

      const reparto = repartir(actual.publicacion.precio, this.reglas.comisionPorcentaje);

      const transaccion = await gestor.transaction(async (tx) => {
        const numero = await this.siguienteNumeroTransaccion(tx);
        return tx.save(
          tx.create(TransaccionReventa, {
            id: transaccionId,
            publicacionId,
            entradaId: actual.entrada.id,
            compradorId,
            vendedorId: actual.publicacion.vendedorId,
            precio: reparto.precio,
            comision: reparto.comision,
            netoVendedor: reparto.netoVendedor,
            // PENDIENTE desde antes de llamar a la pasarela: RNF-11 exige
            // registrar el 100 % de las operaciones financieras, también las
            // que acaban fallando.
            estado: EstadoTransaccion.PENDIENTE,
            numeroTransaccion: numero,
          }),
        );
      });

      const restante = (await this.concurrencia.tiempoRestanteMs(publicacionId)) ?? 0;
      this.log.log(`Checkout ${transaccion.numeroTransaccion} abierto por ${compradorId} sobre ${publicacionId}`);

      return aCheckoutDto(
        transaccion,
        aPublicacionMercadoDto(actual.publicacion, actual.entrada, actual.evento, compradorId),
        restante,
      );
    } catch (error) {
      await this.concurrencia.liberar(publicacionId, transaccionId);
      throw error;
    }
  }

  /**
   * Pasos 7-11 del CU-006: cobrar, transferir la propiedad, invalidar el QR
   * anterior y emitir uno nuevo, y registrar la transferencia en el historial.
   *
   * ## El orden y por qué duele
   *
   * El diagrama de secuencia es explícito: se cobra **antes** de transferir en
   * la base de datos. Eso deja una ventana real —cobro hecho, transferencia no
   * escrita— en la que el comprador pagó y no tiene su entrada.
   *
   * No se puede eliminar sin un protocolo de dos fases con la pasarela, que
   * ninguna pasarela real ofrece. Lo que sí se hace es acotarla:
   *
   * 1. **La referencia del cobro se persiste antes de transferir.** Si la
   *    transferencia falla, queda en la base una transacción `PENDIENTE` *con
   *    referencia de pasarela*, que es la señal inequívoca de "se cobró y no se
   *    entregó" para la conciliación.
   * 2. **El cobro es idempotente** (la clave es el id de la transacción), así
   *    que reintentar no cobra dos veces.
   * 3. La transferencia entera va en **una sola transacción de base de datos**:
   *    o cambian el dueño, el QR, la publicación y el historial, o no cambia
   *    nada. No hay estados intermedios que reparar.
   */
  async pagar(compradorId: string, checkoutId: string, datos: PagarDto): Promise<ResultadoCompraDto> {
    const gestor = this.fuenteDatos.manager;
    const transaccion = await this.cargarTransaccionDelComprador(gestor, compradorId, checkoutId);
    await this.exigirVigente(transaccion.id, transaccion.publicacionId, transaccion.estado);

    const contexto = await this.cargarPublicacion(gestor, transaccion.publicacionId);
    if (contexto.publicacion.estado !== EstadoPublicacion.ACTIVA) {
      throw new PublicacionNoActiva(contexto.publicacion.estado);
    }

    // Se renueva el bloqueo justo antes de cobrar: si quedaban diez segundos,
    // el cobro podría terminar con la reserva ya vencida y la publicación en
    // manos de otro comprador.
    //
    // El resultado **se mira**: `renovar` devuelve false cuando el bloqueo ya
    // no es nuestro, y es la última oportunidad de detener el cobro antes de
    // llamar a la pasarela. Descartarlo era lo que dejaba llegar hasta el cargo
    // a un checkout que ya había perdido su reserva.
    if (!(await this.concurrencia.renovar(transaccion.publicacionId, transaccion.id))) {
      throw new CheckoutNoVigente(
        transaccion.estado,
        'La reserva de esta entrada caducó. Vuelve al mercado e inténtalo de nuevo.',
      );
    }

    // Paso 8: validar la transacción con la pasarela.
    const cobro = await this.pagos.cobrar({
      monto: transaccion.precio,
      moneda: 'COP',
      token: datos.token,
      descripcion: `Reventa ${contexto.evento.nombre} · ${contexto.entrada.localidadNombre}`,
      claveIdempotencia: transaccion.id,
    });

    if (cobro.resultado === ResultadoCobro.RECHAZADO) {
      // CU-006G. Se sabe que no hubo cargo, así que la publicación vuelve al
      // mercado de inmediato en lugar de quedar reservada hasta el TTL.
      transaccion.estado = EstadoTransaccion.RECHAZADA;
      transaccion.motivo = cobro.motivo;
      transaccion.referenciaPasarela = cobro.referencia;
      await gestor.save(transaccion);
      await this.concurrencia.liberar(transaccion.publicacionId, transaccion.id);
      this.log.warn(`Pago rechazado en ${transaccion.numeroTransaccion}: ${cobro.motivo}`);
      throw new PagoRechazado(cobro.motivo ?? 'la pasarela no autorizó el cobro');
    }

    if (cobro.resultado === ResultadoCobro.INDETERMINADO) {
      // CU-006I. **El bloqueo NO se libera**: como no se sabe si hubo cargo,
      // dejar que otra persona compre esta entrada podría acabar en dos cobros
      // por una sola entrada. Se prefiere que la publicación quede retenida
      // hasta que caduque el TTL y alguien concilie.
      transaccion.estado = EstadoTransaccion.FALLIDA;
      transaccion.motivo = cobro.motivo;
      await gestor.save(transaccion);
      this.log.error(
        `Pago INDETERMINADO en ${transaccion.numeroTransaccion} (${cobro.motivo}). ` +
          'Requiere conciliación: no se sabe si se cobró.',
      );
      throw new PagoIndeterminado(transaccion.numeroTransaccion);
    }

    // Aprobado. Antes de tocar nada más, se deja constancia del cobro.
    transaccion.referenciaPasarela = cobro.referencia;
    await gestor.save(transaccion);

    const qrAnterior = contexto.entrada.codigoQr;
    const qrNuevo = this.qr.emitir();

    try {
      await gestor.transaction(async (tx) => {
        // La publicación se cierra PRIMERO y con `estado: ACTIVA` en el WHERE.
        //
        // Esa condición es la última línea de defensa contra la doble venta: si
        // otra transferencia se adelantó, el UPDATE no afecta a ninguna fila y
        // esta se aborta en vez de pisarla. Sin ella, dos pagos en vuelo sobre
        // la misma publicación se sobrescribían el uno al otro sin error y
        // dejaban dos cobros y dos códigos QR sobre una sola entrada.
        //
        // Va primero justamente para que sea la que decide: mientras la
        // transacción no confirme, nadie más puede pasar de aquí.
        const publicacionCerrada = await tx.update(
          PublicacionReventa,
          { id: contexto.publicacion.id, estado: EstadoPublicacion.ACTIVA },
          {
            estado: EstadoPublicacion.VENDIDA,
            compradorId,
            fechaCierre: new Date(),
          },
        );

        if (!publicacionCerrada.affected) {
          throw new CobradoSinTransferir(transaccion.numeroTransaccion);
        }

        // Paso 9 y 10 en un solo UPDATE: el dueño cambia y el QR anterior deja
        // de existir a la vez. Nunca hay un instante en que el código viejo y
        // el nuevo sean ambos válidos — es lo que exige la post-condición 2 y
        // lo que hace medible el "0" de RNF-02.
        //
        // También condicionado: la entrada tiene que seguir EN_REVENTA. Si la
        // expiración o un retiro la devolvieron a su dueño entretanto, no se
        // transfiere.
        const entradaTransferida = await tx.update(
          Entrada,
          { id: contexto.entrada.id, estado: EstadoEntrada.EN_REVENTA },
          {
            propietarioId: compradorId,
            codigoQr: qrNuevo,
            estado: EstadoEntrada.VALIDA,
          },
        );

        if (!entradaTransferida.affected) {
          throw new CobradoSinTransferir(transaccion.numeroTransaccion);
        }

        await tx.update(
          TransaccionReventa,
          { id: transaccion.id },
          { estado: EstadoTransaccion.APROBADA, motivo: null },
        );

        // Paso 11: registrar la transferencia en el historial de propietarios.
        // Va dentro de la misma transacción a propósito: un cambio de dueño sin
        // su fila de auditoría incumpliría el 100 % que exige RNF-11.
        await tx.insert(HistorialPropietario, {
          entradaId: contexto.entrada.id,
          propietarioAnteriorId: contexto.publicacion.vendedorId,
          propietarioNuevoId: compradorId,
          motivo: MotivoCambioPropietario.REVENTA,
          transaccionId: transaccion.id,
          codigoQrAnterior: qrAnterior,
          codigoQrNuevo: qrNuevo,
        });
      });
    } catch (error) {
      // Cobrado y no transferido. La referencia ya quedó guardada arriba, así
      // que la conciliación puede encontrar esta transacción; se registra bien
      // fuerte porque es el caso que hay que mirar a mano.
      this.log.error(
        `COBRADO SIN TRANSFERIR en ${transaccion.numeroTransaccion} ` +
          `(referencia ${cobro.referencia}): ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }

    // El bloqueo se suelta después de confirmar en la base, no antes: soltarlo
    // entre el cobro y el commit dejaría entrar a otro comprador a una
    // publicación que ya está vendida.
    await this.concurrencia.liberar(transaccion.publicacionId, transaccion.id);

    const entradaActualizada = await gestor.findOneByOrFail(Entrada, { id: contexto.entrada.id });
    const transaccionFinal = await gestor.findOneByOrFail(TransaccionReventa, { id: transaccion.id });

    this.log.log(
      `Transferida ${entradaActualizada.numeroTicket} a ${compradorId} · ${transaccionFinal.numeroTransaccion}`,
    );

    // Paso 12 y 13: notificar y liquidar, de forma asíncrona.
    //
    // Se publica DESPUÉS de confirmar en la base y sin esperar a que los
    // consumidores hagan nada: el diagrama de secuencia es explícito en que
    // publicar y notificar quedan "fuera del camino de respuesta". Si el broker
    // está caído, el publicador lo registra y devuelve false — la venta ya está
    // hecha y no se deshace porque un correo no salga.
    await this.publicador.publicarEntradaTransferida(
      this.construirEvento(transaccionFinal, entradaActualizada, contexto.evento.nombre),
    );

    return aResultadoCompraDto(transaccionFinal, entradaActualizada, contexto.evento.nombre);
  }

  /**
   * Flujo alterno **CU-006C**: *"El comprador cancela la compra antes de
   * finalizar el pago"*.
   *
   * Liberar el bloqueo explícitamente, en vez de esperar a que caduque el TTL,
   * es lo que devuelve la entrada al mercado en el acto: si alguien se
   * arrepiente, no tiene sentido que la publicación siga reservada dos minutos
   * más para nadie.
   */
  async cancelar(compradorId: string, checkoutId: string): Promise<CheckoutDto> {
    const gestor = this.fuenteDatos.manager;
    const transaccion = await this.cargarTransaccionDelComprador(gestor, compradorId, checkoutId);

    if (transaccion.estado !== EstadoTransaccion.PENDIENTE) {
      throw new CheckoutNoVigente(
        transaccion.estado,
        `Este checkout está ${transaccion.estado} y ya no puede cancelarse`,
      );
    }

    transaccion.estado = EstadoTransaccion.CANCELADA;
    transaccion.motivo = 'Cancelado por el comprador (CU-006C)';
    await gestor.save(transaccion);

    await this.concurrencia.liberar(transaccion.publicacionId, transaccion.id);
    this.log.log(`Checkout ${transaccion.numeroTransaccion} cancelado por el comprador`);

    const contexto = await this.cargarPublicacion(gestor, transaccion.publicacionId);
    return aCheckoutDto(
      transaccion,
      aPublicacionMercadoDto(contexto.publicacion, contexto.entrada, contexto.evento, compradorId),
      0,
    );
  }

  /**
   * Estado de un checkout, con lo que le queda de reserva.
   *
   * El tiempo restante se lee de Redis y no se calcula a partir de la fecha de
   * creación: el TTL de Redis es lo que de verdad manda, y si el bloqueo se
   * perdió (por un reinicio del broker, por ejemplo) aquí se ve en el acto.
   */
  async consultar(compradorId: string, checkoutId: string): Promise<CheckoutDto> {
    const gestor = this.fuenteDatos.manager;
    const transaccion = await this.cargarTransaccionDelComprador(gestor, compradorId, checkoutId);
    const contexto = await this.cargarPublicacion(gestor, transaccion.publicacionId);
    const restante = (await this.concurrencia.tiempoRestanteMs(transaccion.publicacionId)) ?? 0;

    return aCheckoutDto(
      transaccion,
      aPublicacionMercadoDto(contexto.publicacion, contexto.entrada, contexto.evento, compradorId),
      restante,
    );
  }

  /**
   * Comprueba que un checkout siga vigente: pendiente **y** con su bloqueo
   * todavía en la mano. Lo usará el paso 6 antes de cobrar.
   */
  async exigirVigente(checkoutId: string, publicacionId: string, estado: EstadoTransaccion): Promise<void> {
    if (estado !== EstadoTransaccion.PENDIENTE) {
      throw new CheckoutNoVigente(estado, `Este checkout está ${estado}`);
    }

    // Se comprueba que el bloqueo sea **de este checkout**, no que exista uno
    // cualquiera. La diferencia no es teórica: si el TTL venció y otra persona
    // tomó la publicación, sigue habiendo bloqueo —el suyo— y preguntar solo
    // por su existencia deja pasar a quien ya perdió la reserva. Con los dos
    // pagando a la vez eso acababa en dos cobros, dos transferencias y dos
    // códigos QR sobre una sola entrada.
    if (!(await this.concurrencia.esTitular(publicacionId, checkoutId))) {
      throw new CheckoutNoVigente(
        estado,
        'La reserva de esta entrada caducó. Vuelve al mercado e inténtalo de nuevo.',
      );
    }
  }

  /** Arma la carga del evento a partir de lo que quedó guardado en la base. */
  private construirEvento(
    transaccion: TransaccionReventa,
    entrada: Entrada,
    eventoNombre: string,
  ): EntradaTransferida {
    return {
      evento: EVENTO_ENTRADA_TRANSFERIDA,
      version: VERSION_ENTRADA_TRANSFERIDA,
      // El id del evento es el de la transacción: da a los consumidores una
      // clave estable con la que descartar una entrega repetida.
      id: transaccion.id,
      ocurridoEn: new Date().toISOString(),
      entrada: {
        id: entrada.id,
        numeroTicket: entrada.numeroTicket,
        eventoId: entrada.eventoId,
        eventoNombre,
        localidadNombre: entrada.localidadNombre,
        codigoQrNuevo: entrada.codigoQr,
      },
      transferencia: {
        vendedorId: transaccion.vendedorId,
        compradorId: transaccion.compradorId,
        publicacionId: transaccion.publicacionId,
        transaccionId: transaccion.id,
        numeroTransaccion: transaccion.numeroTransaccion,
      },
      importes: {
        precio: transaccion.precio,
        comision: transaccion.comision,
        netoVendedor: transaccion.netoVendedor,
        moneda: 'COP',
        referenciaPasarela: transaccion.referenciaPasarela ?? '',
      },
    };
  }

  // --- Apoyo -------------------------------------------------------------

  /**
   * Qué hacer cuando el bloqueo ya lo tiene otro.
   *
   * Si lo tiene **el mismo comprador** —porque volvió atrás y pulsó otra vez, o
   * la app se reinició— se le devuelve su checkout en curso en lugar de
   * decirle que la entrada no está disponible. Sin esto, quedaría fuera de su
   * propia compra durante los dos minutos del TTL, que es una forma absurda de
   * cumplir CU-006H.
   */
  private async resolverBloqueoAjeno(
    gestor: EntityManager,
    compradorId: string,
    publicacionId: string,
    titularActual: string | null,
  ): Promise<CheckoutDto> {
    // El bloqueo caducó entre el SET NX y la lectura: otra persona iba por
    // delante pero ya soltó. Se pide reintentar en vez de adivinar.
    if (!titularActual) throw new PublicacionEnCheckout();

    const enCurso = await gestor.findOneBy(TransaccionReventa, { id: titularActual });
    if (!enCurso || enCurso.compradorId !== compradorId || enCurso.estado !== EstadoTransaccion.PENDIENTE) {
      throw new PublicacionEnCheckout();
    }

    const contexto = await this.cargarPublicacion(gestor, publicacionId);
    const restante = (await this.concurrencia.tiempoRestanteMs(publicacionId)) ?? 0;
    this.log.log(`Checkout ${enCurso.numeroTransaccion} reanudado por su propio comprador`);

    return aCheckoutDto(
      enCurso,
      aPublicacionMercadoDto(contexto.publicacion, contexto.entrada, contexto.evento, compradorId),
      restante,
    );
  }

  private async cargarPublicacion(
    gestor: EntityManager,
    publicacionId: string,
  ): Promise<{ publicacion: PublicacionReventa; entrada: Entrada; evento: EventoReferencia }> {
    const publicacion = await gestor.findOneBy(PublicacionReventa, { id: publicacionId });
    if (!publicacion) throw new PublicacionNoEncontrada(publicacionId);

    const entrada = await gestor.findOneBy(Entrada, { id: publicacion.entradaId });
    if (!entrada) throw new EntradaNoEncontrada(publicacion.entradaId);

    const evento = await gestor.findOneBy(EventoReferencia, { eventoId: entrada.eventoId });
    if (!evento) throw new EventoNoConocido(entrada.eventoId);

    return { publicacion, entrada, evento };
  }

  private exigirComprable(publicacion: PublicacionReventa, compradorId: string): void {
    if (publicacion.vendedorId === compradorId) throw new NoPuedeComprarSuPropiaEntrada();
    if (publicacion.estado !== EstadoPublicacion.ACTIVA) throw new PublicacionNoActiva(publicacion.estado);
    if (publicacion.fechaExpiracion <= new Date()) throw new VentanaReventaCerrada(publicacion.fechaExpiracion);
  }

  private async cargarTransaccionDelComprador(
    gestor: EntityManager,
    compradorId: string,
    checkoutId: string,
  ): Promise<TransaccionReventa> {
    const transaccion = await gestor.findOneBy(TransaccionReventa, { id: checkoutId });
    // Un checkout de otra persona se responde igual que uno inexistente: decir
    // "existe pero no es tuyo" confirmaría a un desconocido que ese id es real.
    if (!transaccion || transaccion.compradorId !== compradorId) throw new CheckoutNoEncontrado(checkoutId);
    return transaccion;
  }

  private async siguienteNumeroTransaccion(gestor: EntityManager): Promise<string> {
    const filas = (await gestor.query(`SELECT nextval('numero_transaccion_seq') AS valor`)) as { valor: string }[];
    const consecutivo = String(filas[0].valor).padStart(6, '0');
    return `TXN-${new Date().getFullYear()}-${consecutivo}`;
  }
}
