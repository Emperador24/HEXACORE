import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { createHash } from 'node:crypto';
import { Entrada, EstadoEntrada } from '../../persistencia/entidades/entrada.entity';
import {
  HistorialPropietario,
  MotivoCambioPropietario,
} from '../../persistencia/entidades/historial-propietario.entity';

/** Lo que puede pasar al intentar gastar un QR. Acceso QR lo traduce a su respuesta. */
export enum ResultadoValidacion {
  OK = 'OK',
  QR_DESCONOCIDO = 'QR_DESCONOCIDO',
  OTRO_EVENTO = 'OTRO_EVENTO',
  YA_UTILIZADA = 'YA_UTILIZADA',
  ANULADA = 'ANULADA',
  EN_REVENTA = 'EN_REVENTA',
}

export interface QrValido {
  /** SHA-256 del código. Nunca sale el código en claro. */
  hash: string;
  numeroTicket: string;
  localidadNombre: string;
}

/** Una entrada de la persona, con su estado actual. El estado NO se copia: cambia. */
export interface EntradaPropia extends EntradaEnReventa {
  estado: EstadoEntrada;
}

/** Por qué no se pudo poner una entrada en reventa. Cada uno es un camino del CU-006. */
export enum MotivoNoRevendible {
  NO_EXISTE = 'NO_EXISTE',
  /** Pre-condición 1: la entrada es de otra persona. */
  NO_ES_SUYA = 'NO_ES_SUYA',
  /** Pre-condición 2 y camino CU-006E: usada, anulada o ya publicada. */
  ESTADO = 'ESTADO',
}

export type ResultadoEnReventa =
  | { marcada: true; entrada: EntradaEnReventa }
  | { marcada: false; motivo: MotivoNoRevendible; estado?: EstadoEntrada };

/** Lo que Postventa copia en su publicación. Un anuncio muestra lo que se anunció. */
export interface EntradaEnReventa {
  entradaId: string;
  eventoId: string;
  numeroTicket: string;
  localidadNombre: string;
  precioOriginal: number;
}

export interface EntradaValidada {
  resultado: ResultadoValidacion;
  entradaId: string | null;
  numeroTicket: string | null;
  localidadNombre: string | null;
  propietarioId: string | null;
}

/**
 * Operaciones sobre `Entrada` que necesitan otros servicios.
 *
 * `Entrada` es de Ventas y de nadie más: es quien cambia su dueño y su estado.
 * Antes de ADR-14, Acceso QR la marcaba como usada por su cuenta porque vivían
 * en el mismo proceso; ahora pide, y aquí se decide.
 *
 * El `UPDATE` condicionado sigue siendo la autoridad sobre la doble entrada:
 * dos puertas escaneando el mismo código a la vez, una gana y la otra se
 * encuentra la fila fuera de `VALIDA`. Que la puerta esté en otro servicio no
 * cambia eso, porque la condición la resuelve PostgreSQL.
 */
@Injectable()
export class EntradasInternasService {
  private readonly log = new Logger(EntradasInternasService.name);

  constructor(@InjectDataSource() private readonly fuenteDatos: DataSource) {}

  async marcarUsada(codigoQr: string, eventoId: string): Promise<EntradaValidada> {
    const vacia = (resultado: ResultadoValidacion): EntradaValidada => ({
      resultado,
      entradaId: null,
      numeroTicket: null,
      localidadNombre: null,
      propietarioId: null,
    });

    return this.fuenteDatos.transaction(async (tx) => {
      const entrada = await tx.findOne(Entrada, { where: { codigoQr } });
      if (!entrada) return vacia(ResultadoValidacion.QR_DESCONOCIDO);
      if (entrada.eventoId !== eventoId) return vacia(ResultadoValidacion.OTRO_EVENTO);

      // En los rechazos se devuelve igual el id: Acceso QR lo necesita para
      // mirar en SU tabla cuándo y por dónde se usó, que es lo que CU-002D le
      // pide decirle al personal de la puerta.
      const identificada = (resultado: ResultadoValidacion): EntradaValidada => ({
        ...vacia(resultado),
        entradaId: entrada.id,
      });
      if (entrada.estado === EstadoEntrada.USADA) return identificada(ResultadoValidacion.YA_UTILIZADA);
      if (entrada.estado === EstadoEntrada.ANULADA) return identificada(ResultadoValidacion.ANULADA);
      if (entrada.estado === EstadoEntrada.EN_REVENTA) return identificada(ResultadoValidacion.EN_REVENTA);

      // La condición `estado = VALIDA` es la que decide. Sin ella, dos puertas
      // simultáneas se pisarían el UPDATE y las dos darían paso.
      const marcada = await tx.update(
        Entrada,
        { id: entrada.id, estado: EstadoEntrada.VALIDA },
        { estado: EstadoEntrada.USADA },
      );
      if (!marcada.affected) {
        this.log.warn(`CU-002D: carrera perdida al marcar la entrada ${entrada.id}`);
        return { ...vacia(ResultadoValidacion.YA_UTILIZADA), entradaId: entrada.id };
      }

      return {
        resultado: ResultadoValidacion.OK,
        entradaId: entrada.id,
        numeroTicket: entrada.numeroTicket,
        localidadNombre: entrada.localidadNombre,
        propietarioId: entrada.propietarioId,
      };
    });
  }

  /**
   * Devuelve una entrada a `VALIDA`. Es la **compensación** de `marcarUsada`.
   *
   * La usa Acceso QR cuando marcó la entrada y después no pudo dejar su
   * registro de ingreso: sin esto, esa persona se quedaría con la entrada
   * gastada y sin haber entrado, que es el peor resultado posible en una
   * puerta.
   *
   * Condicionada a `USADA` para que no pueda revivir una entrada anulada ni
   * una que ya se revendió.
   */
  async revertirUso(entradaId: string): Promise<boolean> {
    const revertida = await this.fuenteDatos
      .getRepository(Entrada)
      .update({ id: entradaId, estado: EstadoEntrada.USADA }, { estado: EstadoEntrada.VALIDA });

    if (!revertida.affected) {
      this.log.error(`No se pudo devolver a VALIDA la entrada ${entradaId}: hay que mirarlo a mano`);
      return false;
    }
    this.log.warn(`Entrada ${entradaId} devuelta a VALIDA: Acceso QR no pudo registrar el ingreso`);
    return true;
  }

  /**
   * Los QR válidos de un evento, en **hash**, para que la puerta valide sin red
   * (CU-002E).
   *
   * Van hasheados y no en claro a propósito: el dispositivo solo necesita poder
   * comparar, no conocer los códigos. Si se pierde o se roba, lo que lleva no
   * sirve para fabricar una entrada.
   */
  async qrValidos(eventoId: string): Promise<QrValido[]> {
    const entradas = await this.fuenteDatos.getRepository(Entrada).find({
      where: { eventoId, estado: EstadoEntrada.VALIDA },
      select: { codigoQr: true, numeroTicket: true, localidadNombre: true },
    });
    return entradas.map((e) => ({
      hash: createHash('sha256').update(e.codigoQr).digest('hex'),
      numeroTicket: e.numeroTicket,
      localidadNombre: e.localidadNombre,
    }));
  }

  /**
   * Las entradas de una persona (paso 1 del CU-006).
   *
   * Postventa necesita ofrecer "elige una de tus entradas", pero la pregunta
   * *¿qué entradas son mías?* es de Ventas: es su tabla y su concepto de
   * propiedad. Postventa compone la respuesta añadiendo lo que sí es suyo —
   * tope de precio, publicación activa, reglas de reventa del evento.
   *
   * Se excluyen las anuladas: no son revendibles y no tiene sentido ofrecerlas.
   */
  async entradasDe(propietarioId: string): Promise<EntradaPropia[]> {
    const entradas = await this.fuenteDatos.getRepository(Entrada).find({
      where: { propietarioId, estado: Not(EstadoEntrada.ANULADA) },
      order: { numeroTicket: 'ASC' },
    });
    return entradas.map((entrada) => ({
      entradaId: entrada.id,
      eventoId: entrada.eventoId,
      numeroTicket: entrada.numeroTicket,
      localidadNombre: entrada.localidadNombre,
      precioOriginal: entrada.precioOriginal,
      estado: entrada.estado,
    }));
  }

  /**
   * Pone una entrada en reventa y devuelve de qué entrada se trata.
   *
   * ## Por qué va antes de crear la publicación
   *
   * Si fuera al revés, existiría una publicación sobre una entrada todavía
   * `VALIDA`, y alguien podría entrar al evento con ella mientras se vende.
   * En este orden el peor caso es una entrada bloqueada sin publicación: nadie
   * la compra, nadie la usa, y se arregla devolviéndola.
   *
   * ## Por qué el dueño se comprueba aquí
   *
   * La condición del `UPDATE` lleva `propietarioId` además del estado, así que
   * "es tuya" y "está disponible" se deciden **a la vez y en la base**.
   * Comprobarlo antes con un `SELECT` dejaría una ventana entre la lectura y
   * la escritura en la que la entrada pudo cambiar de dueño.
   *
   * Devuelve los datos que Postventa necesita para su publicación: un anuncio
   * muestra lo que se anunció, y esos datos ya no cambian mientras esté
   * publicada.
   */
  async marcarEnReventa(entradaId: string, propietarioId: string): Promise<ResultadoEnReventa> {
    return this.fuenteDatos.transaction(async (tx) => {
      const marcada = await tx.update(
        Entrada,
        { id: entradaId, propietarioId, estado: EstadoEntrada.VALIDA },
        { estado: EstadoEntrada.EN_REVENTA },
      );

      if (marcada.affected) {
        const entrada = await tx.findOneByOrFail(Entrada, { id: entradaId });
        return {
          marcada: true,
          entrada: {
            entradaId: entrada.id,
            eventoId: entrada.eventoId,
            numeroTicket: entrada.numeroTicket,
            localidadNombre: entrada.localidadNombre,
            precioOriginal: entrada.precioOriginal,
          },
        };
      }

      // El UPDATE no afectó a nada, así que ahora —y solo ahora— se lee la fila
      // para poder decir *por qué*.
      //
      // La condición del UPDATE junta "es tuya" y "está disponible" para que se
      // decidan a la vez y en la base; el precio de juntarlas es que su
      // negativa no dice cuál de las dos falló. Diagnosticar después con un
      // SELECT recupera esa distinción —el CU-006 tiene un camino para cada
      // una— y no debilita nada: la autoridad sigue siendo el UPDATE, que ya
      // falló. Este SELECT es informativo, y solo corre cuando ya se rechazó.
      const entrada = await tx.findOneBy(Entrada, { id: entradaId });
      if (!entrada) return { marcada: false, motivo: MotivoNoRevendible.NO_EXISTE };
      if (entrada.propietarioId !== propietarioId) {
        return { marcada: false, motivo: MotivoNoRevendible.NO_ES_SUYA };
      }
      return { marcada: false, motivo: MotivoNoRevendible.ESTADO, estado: entrada.estado };
    });
  }

  /**
   * Devuelve una entrada de la reventa a su dueño, sin transferir nada.
   *
   * Sirve para retirar una publicación (CU-006), para la expiración (CU-006D)
   * y como **compensación** cuando Postventa no pudo crear la publicación
   * después de marcarla.
   *
   * No genera QR nuevo ni fila de historial a propósito: el historial registra
   * cambios de propietario, y aquí no ha cambiado nadie.
   */
  async devolverDeReventa(entradaId: string): Promise<boolean> {
    const devuelta = await this.fuenteDatos
      .getRepository(Entrada)
      .update({ id: entradaId, estado: EstadoEntrada.EN_REVENTA }, { estado: EstadoEntrada.VALIDA });
    return (devuelta.affected ?? 0) > 0;
  }

  /**
   * Transfiere una entrada a su nuevo dueño (CU-006, pasos 9 a 11).
   *
   * **El cambio de dueño, el QR nuevo y la fila de historial van en una sola
   * transacción local**, y eso es deliberado: es lo que queda de la
   * transacción grande que había antes de ADR-14, y es donde viven las dos
   * garantías que no se pueden aflojar.
   *
   * - El `UPDATE` condicionado a `EN_REVENTA` con el QR nuevo en la misma
   *   sentencia: nunca hay un instante en que el código viejo y el nuevo sean
   *   ambos válidos. Es lo que hace medible el 0 de RNF-02.
   * - El historial en la misma transacción: un cambio de dueño sin su fila de
   *   auditoría incumpliría el 100 % que exige RNF-11.
   *
   * Lo que se perdió al separar no es esto, sino que el **cierre de la
   * publicación** ya no va dentro. Eso lo compensa Postventa reabriéndola.
   */
  async transferir(datos: {
    entradaId: string;
    compradorId: string;
    vendedorId: string;
    transaccionId: string;
    codigoQrNuevo: string;
  }): Promise<{ transferida: boolean; qrAnterior: string | null }> {
    return this.fuenteDatos.transaction(async (tx) => {
      const entrada = await tx.findOne(Entrada, { where: { id: datos.entradaId } });
      if (!entrada) return { transferida: false, qrAnterior: null };
      const qrAnterior = entrada.codigoQr;

      const transferida = await tx.update(
        Entrada,
        { id: datos.entradaId, estado: EstadoEntrada.EN_REVENTA },
        {
          propietarioId: datos.compradorId,
          codigoQr: datos.codigoQrNuevo,
          estado: EstadoEntrada.VALIDA,
        },
      );
      if (!transferida.affected) {
        this.log.warn(`La entrada ${datos.entradaId} ya no estaba EN_REVENTA al transferir`);
        return { transferida: false, qrAnterior };
      }

      await tx.insert(HistorialPropietario, {
        entradaId: datos.entradaId,
        propietarioAnteriorId: datos.vendedorId,
        propietarioNuevoId: datos.compradorId,
        motivo: MotivoCambioPropietario.REVENTA,
        transaccionId: datos.transaccionId,
        codigoQrAnterior: qrAnterior,
        codigoQrNuevo: datos.codigoQrNuevo,
      });

      return { transferida: true, qrAnterior };
    });
  }
}
