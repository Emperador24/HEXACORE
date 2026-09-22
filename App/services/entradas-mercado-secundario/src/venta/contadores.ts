import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CodigoPromocional } from '../persistencia/entidades/codigo-promocional.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { LocalidadEvento } from '../persistencia/entidades/localidad-evento.entity';

/**

 * Todos los contadores siguen el mismo patron: 
 * un UPDATE que comprueba y modifica a la vez
 * `SET x = x + n WHERE x + n <= limite`
 * No se lee primero y se escribe despues: entre las dos cosas cabria otra peticion
 * 
 * con el UPDATE condicional
 * Postgres bloquea la fila durante la sentencia
 * la segunda petición ve el valor ya actualizado
 * los CHECK de la migracion: si alguien escribe un UPDATE sin la condición la base lo rechaza.
 *
 * clase inyectable para que las pruebas de los servicios la puedan sustituir por un doble.
 *
 * `n` se interpola en el SQL asi que debe ser un entero positivo
 * imposible colar algo que no sea un numero
 */
@Injectable()
export class Contadores {
  //aparta n cupos
  async reservarCupo(tx: EntityManager, localidadId: string, n: number): Promise<boolean> {
    return this.actualizar(tx, LocalidadEvento, { reservadas: () => `reservadas + ${entero(n)}` }, 'localidad_id = :id', localidadId, `vendidas + reservadas + ${entero(n)} <= aforo`);
  }

  // al pagar lo reservado pasa a vendido
  async confirmarCupo(tx: EntityManager, localidadId: string, n: number): Promise<boolean> {
    return this.actualizar(
      tx,
      LocalidadEvento,
      { reservadas: () => `reservadas - ${entero(n)}`, vendidas: () => `vendidas + ${entero(n)}` },
      'localidad_id = :id',
      localidadId,
      `reservadas >= ${entero(n)}`,
    );
  }

  //la reserva vencio
  async liberarReserva(tx: EntityManager, localidadId: string, n: number): Promise<boolean> {
    return this.actualizar(tx, LocalidadEvento, { reservadas: () => `reservadas - ${entero(n)}` }, 'localidad_id = :id', localidadId, `reservadas >= ${entero(n)}`);
  }

  //entradas canceladas
  async devolverVendidas(tx: EntityManager, localidadId: string, n: number): Promise<boolean> {
    return this.actualizar(tx, LocalidadEvento, { vendidas: () => `vendidas - ${entero(n)}` }, 'localidad_id = :id', localidadId, `vendidas >= ${entero(n)}`);
  }

  // gastar un uso del cupom 
  async ocuparUsoCupon(tx: EntityManager, codigo: string): Promise<boolean> {
    return this.actualizar(tx, CodigoPromocional, { usos: () => 'usos + 1' }, 'codigo = :id', codigo, '(limite_usos IS NULL OR usos < limite_usos)');
  }

  // regresar uso
  async liberarUsoCupon(tx: EntityManager, codigo: string): Promise<boolean> {
    return this.actualizar(tx, CodigoPromocional, { usos: () => 'usos - 1' }, 'codigo = :id', codigo, 'usos > 0');
  }

  // sumar ingreso
  async sumarAsistente(tx: EntityManager, eventoId: string): Promise<boolean> {
    return this.actualizar(tx, EventoReferencia, { asistentes: () => 'asistentes + 1' }, 'evento_id = :id', eventoId, '(aforo_maximo IS NULL OR asistentes < aforo_maximo)');
  }

  private async actualizar<T extends object>(
    tx: EntityManager,
    entidad: new () => T,
    cambios: Record<string, () => string>,
    filtro: string,
    id: string,
    condicion: string,
  ): Promise<boolean> {
    const resultado = await tx
      .createQueryBuilder()
      .update(entidad)
      .set(cambios as never)
      .where(`${filtro} AND ${condicion}`, { id })
      .execute();
    return (resultado.affected ?? 0) > 0;
  }
}

function entero(n: number): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Se esperaba un entero positivo, llegó ${n}`);
  }
  return n;
}
