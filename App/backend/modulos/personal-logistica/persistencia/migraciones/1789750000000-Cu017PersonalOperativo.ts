import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-017 (Asignar personal operativo): zonas de un evento con el personal
 * (rol + cantidad) que requieren, y el enlace opcional de `turnos` hacia la
 * zona que cubren (nullable: los turnos creados por el flujo simple de
 * `POST /turnos` no pasan por una zona formal).
 */
export class Cu017PersonalOperativo1789750000000 implements MigrationInterface {
  name = 'Cu017PersonalOperativo1789750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "zonas_evento" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "eventoId" character varying NOT NULL, "nombre" character varying NOT NULL, "rolRequerido" character varying NOT NULL, "personalRequerido" integer NOT NULL, CONSTRAINT "PK_zonas_evento_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "turnos" ADD "zonaEventoId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "turnos" ADD CONSTRAINT "FK_turnos_zonaEventoId" FOREIGN KEY ("zonaEventoId") REFERENCES "zonas_evento"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "turnos" DROP CONSTRAINT "FK_turnos_zonaEventoId"`);
    await queryRunner.query(`ALTER TABLE "turnos" DROP COLUMN "zonaEventoId"`);
    await queryRunner.query(`DROP TABLE "zonas_evento"`);
  }
}
