import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-021, ampliación del 17/11: la persona puede cancelar su reserva de
 * parqueadero si el evento no es hoy, con devolución completa. Nuevo estado
 * `CANCELADA` (no retiene el espacio: los índices únicos parciales solo cuentan
 * las reservas activas) y la referencia del reembolso de la pasarela.
 */
export class CancelacionReservasCu0211795000000000 implements MigrationInterface {
  name = 'CancelacionReservasCu0211795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservas" DROP CONSTRAINT "CHK_reservas_estado"`);
    await queryRunner.query(
      `ALTER TABLE "reservas" ADD CONSTRAINT "CHK_reservas_estado" CHECK ("estado" IN ('PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA', 'USADA', 'EXPIRADA', 'CANCELADA'))`);
    await queryRunner.query(`ALTER TABLE "reservas" ADD "cancelada_en" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "reservas" ADD "referencia_reembolso" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "reservas" SET "estado" = 'EXPIRADA' WHERE "estado" = 'CANCELADA'`);
    await queryRunner.query(`ALTER TABLE "reservas" DROP COLUMN "referencia_reembolso"`);
    await queryRunner.query(`ALTER TABLE "reservas" DROP COLUMN "cancelada_en"`);
    await queryRunner.query(`ALTER TABLE "reservas" DROP CONSTRAINT "CHK_reservas_estado"`);
    await queryRunner.query(
      `ALTER TABLE "reservas" ADD CONSTRAINT "CHK_reservas_estado" CHECK ("estado" IN ('PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA', 'USADA', 'EXPIRADA'))`);
  }
}
