import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-026: la copia del evento guarda la versión que aplicó del mensaje de
 * Núcleo, para descartar un mensaje repetido o que llega desordenado tras un
 * reintento. Las filas sembradas empiezan en 0: cualquier mensaje real las pisa.
 */
export class VersionEvento1794400000002 implements MigrationInterface {
  name = 'VersionEvento1794400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "eventos_referencia" ADD COLUMN "version_evento" integer NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "eventos_referencia" DROP COLUMN "version_evento"`);
  }
}
