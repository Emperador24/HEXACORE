import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { Entrada, EstadoEntrada } from '../../persistencia/entidades/entrada.entity';

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
}
