import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';

/**
 * El aforo del recinto (CU-002, paso 8).
 *
 * Es lo único que este servicio cuenta. Los cupos por localidad y los usos de
 * promoción se quedaron en Ventas: aquí no se vende, se deja entrar.
 */
@Injectable()
export class Contadores {
  /**
   * Suma uno al aforo si cabe. Devuelve `false` si el recinto está lleno.
   *
   * La condición va **dentro del UPDATE** y no en una lectura previa: con
   * varias puertas escaneando a la vez, leer-y-luego-escribir dejaría entrar
   * de más. Aquí lo decide PostgreSQL en una sola operación.
   */
  async sumarAsistente(tx: EntityManager, eventoId: string): Promise<boolean> {
    const resultado = await tx
      .createQueryBuilder()
      .update(EventoReferencia)
      .set({ asistentes: () => 'asistentes + 1' })
      .where('evento_id = :id AND (aforo_maximo IS NULL OR asistentes < aforo_maximo)', { id: eventoId })
      .execute();
    return (resultado.affected ?? 0) > 0;
  }

  /**
   * Devuelve una plaza. Es la compensación de `sumarAsistente`.
   *
   * Condicionada a `asistentes > 0` para no dejar el conteo en negativo si se
   * compensara dos veces.
   */
  async restarAsistente(tx: EntityManager, eventoId: string): Promise<boolean> {
    const resultado = await tx
      .createQueryBuilder()
      .update(EventoReferencia)
      .set({ asistentes: () => 'asistentes - 1' })
      .where('evento_id = :id AND asistentes > 0', { id: eventoId })
      .execute();
    return (resultado.affected ?? 0) > 0;
  }
}
