import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renovación de sesiones (DECISIONES.md §21).
 *
 * Una fila de `sesiones` pasa a ser **una sesión en un dispositivo**, que dura
 * mientras se use, y no un token concreto. Cada renovación emite un token de
 * acceso nuevo con el mismo `jti` y sube la generación del token de
 * renovación.
 *
 * - `generacion_renovacion`: la única que vale ahora. Un token auténtico con
 *   una generación menor es uno ya gastado (posible robo).
 * - `renovacion_expira_en`: hasta cuándo se puede renovar. Cada renovación la
 *   aplaza; sin renovar, la sesión muere.
 * - `renovada_en`: la última renovación, para auditoría.
 * - `motivo_revocacion`: por qué se cerró. Si fue por reutilizar un token de
 *   renovación, la app de la persona legítima recibe un aviso de seguridad y
 *   no un simple "tu sesión terminó".
 *
 * Las sesiones anteriores a esta migración quedan sin `renovacion_expira_en`:
 * no se pueden renovar y terminan cuando caduque su token, como antes.
 */
export class RenovacionSesiones1789603200000 implements MigrationInterface {
  name = 'RenovacionSesiones1789603200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sesiones"
        ADD COLUMN "generacion_renovacion" integer NOT NULL DEFAULT 0,
        ADD COLUMN "renovacion_expira_en" timestamptz NULL,
        ADD COLUMN "renovada_en" timestamptz NULL,
        ADD COLUMN "motivo_revocacion" varchar(20) NULL,
        ADD CONSTRAINT "ck_sesiones_generacion" CHECK ("generacion_renovacion" >= 0),
        ADD CONSTRAINT "ck_sesiones_motivo_revocacion" CHECK (
          "motivo_revocacion" IS NULL OR "motivo_revocacion" IN ('REUTILIZACION')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sesiones"
        DROP CONSTRAINT IF EXISTS "ck_sesiones_motivo_revocacion",
        DROP CONSTRAINT IF EXISTS "ck_sesiones_generacion",
        DROP COLUMN IF EXISTS "motivo_revocacion",
        DROP COLUMN IF EXISTS "renovada_en",
        DROP COLUMN IF EXISTS "renovacion_expira_en",
        DROP COLUMN IF EXISTS "generacion_renovacion"
    `);
  }
}
