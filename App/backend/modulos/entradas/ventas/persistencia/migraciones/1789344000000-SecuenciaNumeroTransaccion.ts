import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Secuencia para el número legible de transacción (`TXN-2026-000001`).
 *
 * El identificador real de una transacción es su UUID; este número existe para
 * que una persona pueda leerlo por teléfono al conciliar un cobro, tal como el
 * prototipo ya lo mostraba (`TXN-2026-000501` en el Portal Web Cliente).
 *
 * Se usa una secuencia y no un contador en el código porque tiene que ser
 * único con varias réplicas del servicio corriendo a la vez (ASR-06): dos
 * instancias calculando "el siguiente número" por su cuenta chocarían contra
 * la restricción `uq_transacciones_numero` y tumbarían un checkout.
 *
 * Las secuencias de PostgreSQL no se reinician al abortar una transacción: si
 * un checkout falla, su número queda sin usar y habrá huecos. Es correcto —
 * la secuencia garantiza unicidad, no continuidad.
 */
export class SecuenciaNumeroTransaccion1789344000000 implements MigrationInterface {
  name = 'SecuenciaNumeroTransaccion1789344000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE "numero_transaccion_seq" START 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "numero_transaccion_seq"`);
  }
}
