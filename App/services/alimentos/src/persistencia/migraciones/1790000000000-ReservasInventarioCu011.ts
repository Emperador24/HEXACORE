import { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade únicamente el registro técnico de reservas; el inventario físico no se modifica. */
export class ReservasInventarioCu0111790000000000 implements MigrationInterface {
  name = 'ReservasInventarioCu0111790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "reserva_inventario_estado" AS ENUM (
        'PREPARANDO', 'ACTIVA', 'LIBERACION_PENDIENTE', 'LIBERADA', 'CONSUMO_PENDIENTE', 'CONSUMIDA'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "reservas_inventario" (
        "pedido_id"      uuid PRIMARY KEY,
        "estado"         "reserva_inventario_estado" NOT NULL DEFAULT 'PREPARANDO',
        "creada_en"      timestamptz NOT NULL DEFAULT now(),
        "actualizada_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_reservas_inventario_pedido"
          FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reservas_inventario"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reserva_inventario_estado"`);
  }
}
