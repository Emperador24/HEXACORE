import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bandeja de salida (Transactional Outbox, ADR-15).
 *
 * El índice parcial es el que usa el publicador: solo mira lo pendiente, y lo
 * pendiente es poco aunque la tabla crezca.
 */
export class BandejaSalida1790553600000 implements MigrationInterface {
  name = 'BandejaSalida1790553600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "eventos_salientes" (
        "secuencia" bigserial PRIMARY KEY,
        "exchange" varchar(80) NOT NULL,
        "clave" varchar(80) NOT NULL,
        "cuerpo" jsonb NOT NULL,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "publicado_en" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_eventos_salientes_pendientes"
        ON "eventos_salientes" ("secuencia") WHERE "publicado_en" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "eventos_salientes"`);
  }
}
