import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-029 (Gestión de recintos y zonas) sobre las tablas que creó CU-026.
 *
 * - Zonas con su posición en el plano (porcentajes del ancho/alto, para que
 *   el dibujo no dependa del tamaño de la imagen) y su color.
 * - Plano del recinto: una imagen por recinto, guardada en la base. No hay
 *   almacenamiento de objetos en la arquitectura actual; ver README.
 * - Quién y cuándo cambió el recinto.
 */
export class Cu029RecintosZonas1793800000000 implements MigrationInterface {
  name = 'Cu029RecintosZonas1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "recintos" ADD "actualizado_por" uuid`);
    await queryRunner.query(`ALTER TABLE "recintos" ADD "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" ADD "x" real`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" ADD "y" real`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" ADD "ancho" real`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" ADD "alto" real`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" ADD "color" character varying(9)`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" ADD CONSTRAINT "CHK_zonas_recinto_posicion" CHECK (("x" IS NULL AND "y" IS NULL AND "ancho" IS NULL AND "alto" IS NULL) OR ("x" >= 0 AND "y" >= 0 AND "ancho" > 0 AND "alto" > 0 AND "x" + "ancho" <= 100.001 AND "y" + "alto" <= 100.001))`);
    await queryRunner.query(`CREATE TABLE "planos_recinto" ("recinto_id" uuid NOT NULL, "tipo" character varying(40) NOT NULL, "contenido" bytea NOT NULL, "tamano" integer NOT NULL, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_planos_recinto" PRIMARY KEY ("recinto_id"), CONSTRAINT "CHK_planos_recinto_tamano" CHECK ("tamano" > 0 AND "tamano" <= 2097152), CONSTRAINT "FK_planos_recinto_recinto" FOREIGN KEY ("recinto_id") REFERENCES "recintos"("id") ON DELETE CASCADE)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "planos_recinto"`);
    await queryRunner.query(`ALTER TABLE "zonas_recinto" DROP CONSTRAINT "CHK_zonas_recinto_posicion"`);
    for (const c of ['color', 'alto', 'ancho', 'y', 'x']) await queryRunner.query(`ALTER TABLE "zonas_recinto" DROP COLUMN "${c}"`);
    await queryRunner.query(`ALTER TABLE "recintos" DROP COLUMN "actualizado_en"`);
    await queryRunner.query(`ALTER TABLE "recintos" DROP COLUMN "actualizado_por"`);
  }
}
