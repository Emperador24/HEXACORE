import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { BandejaSalida } from '../../comun/eventos/bandeja-salida.service';
import { Entrada, EstadoEntrada } from '../../persistencia/entidades/entrada.entity';
import {
  HistorialPropietario,
  MotivoCambioPropietario,
} from '../../persistencia/entidades/historial-propietario.entity';

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

/**
 * Operaciones sobre `Entrada` que necesita Postventa (CU-006).
 *
 * `Entrada` es de Ventas y de nadie más: es quien cambia su dueño y su estado.
 *
 * **Acceso QR ya no llama aquí** (ADR-15). Antes pedía gastar el QR, revertir
 * el uso y la lista de QR válidos; ahora mantiene su propia copia del estado
 * de cada QR, alimentada por `CompraConfirmada` y `EntradaActualizada`. Por eso
 * cada cambio que la puerta tiene que saber deja su evento en la bandeja de
 * salida, en la misma transacción que el cambio.
 */
@Injectable()
export class EntradasInternasService {
  private readonly log = new Logger(EntradasInternasService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly bandeja: BandejaSalida,
  ) {}

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
        // La puerta deja de aceptarla mientras está publicada.
        await this.bandeja.encolarEstadoDe(tx, [entradaId]);
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
    return this.fuenteDatos.transaction(async (tx) => {
      const devuelta = await tx.update(
        Entrada,
        { id: entradaId, estado: EstadoEntrada.EN_REVENTA },
        { estado: EstadoEntrada.VALIDA },
      );
      if (!devuelta.affected) return false;
      await this.bandeja.encolarEstadoDe(tx, [entradaId]);
      return true;
    });
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

      // Es el evento que invalida el QR anterior en la puerta (ADR-15): lleva
      // el hash del nuevo, y Acceso QR sustituye el que tenía. Ya no valía allí
      // desde que la entrada salió a reventa, así que el viejo nunca vuelve a
      // ser aceptado.
      await this.bandeja.encolarEstadoDe(tx, [datos.entradaId]);

      return { transferida: true, qrAnterior };
    });
  }
}
