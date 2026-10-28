import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Administración de cuentas — CU-027B y el *"activar, desactivar o eliminar
 * cuentas"* del objetivo del CU-027.
 *
 * Dos cosas:
 *
 * 1. `usuarios.eliminada_en`. Eliminar una cuenta **no borra la fila**: la
 *    anonimiza (DECISIONES.md §19). Esta columna distingue una cuenta
 *    eliminada de una simplemente desactivada, que sí puede reactivarse.
 * 2. `auditoria_cuentas`, de solo inserción: quién activó, desactivó o eliminó
 *    qué cuenta, cuándo y por qué. ASR-03 pide que los accesos a credenciales
 *    *"queden registrados para auditoría"*, y una desactivación sin rastro no
 *    se puede explicar después.
 */
export class AdministracionCuentasCu027b1789516800000 implements MigrationInterface {
  name = 'AdministracionCuentasCu027b1789516800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" ADD COLUMN "eliminada_en" timestamptz NULL`);
    // Una cuenta eliminada está desactivada, siempre. Si pudiera estar ACTIVA,
    // alguien podría entrar a una cuenta que ya no es de nadie.
    await queryRunner.query(`
      ALTER TABLE "usuarios" ADD CONSTRAINT "ck_usuarios_eliminada_desactivada"
        CHECK ("eliminada_en" IS NULL OR "estado" = 'DESACTIVADA')
    `);

    await queryRunner.query(`
      CREATE TABLE "auditoria_cuentas" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cuenta_id"       uuid NOT NULL,
        "accion"          varchar(20) NOT NULL,
        "estado_anterior" "estado_cuenta" NOT NULL,
        "estado_nuevo"    "estado_cuenta" NOT NULL,
        "realizada_por"   uuid NOT NULL,
        "motivo"          varchar(300) NULL,
        "sesiones_cerradas" integer NOT NULL DEFAULT 0,
        "fecha"           timestamptz NOT NULL DEFAULT now(),
        -- La cuenta nunca se borra (se anonimiza), así que la referencia
        -- siempre resuelve. RESTRICT por si alguien lo intentara a mano.
        CONSTRAINT "fk_auditoria_cuenta"
          FOREIGN KEY ("cuenta_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_auditoria_autor"
          FOREIGN KEY ("realizada_por") REFERENCES "usuarios" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_auditoria_accion"
          CHECK ("accion" IN ('ACTIVAR', 'REACTIVAR', 'DESACTIVAR', 'ELIMINAR')),
        CONSTRAINT "ck_auditoria_sesiones" CHECK ("sesiones_cerradas" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_auditoria_cuenta" ON "auditoria_cuentas" ("cuenta_id", "fecha" DESC)`,
    );

    // Solo inserción, como el historial de propietarios del CU-006: un
    // registro de auditoría que se puede editar no prueba nada.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "auditoria_cuentas_solo_insercion"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'auditoria_cuentas es de solo inserción (% no permitido)', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "tr_auditoria_cuentas_solo_insercion"
        BEFORE UPDATE OR DELETE ON "auditoria_cuentas"
        FOR EACH ROW EXECUTE FUNCTION "auditoria_cuentas_solo_insercion"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_cuentas"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "auditoria_cuentas_solo_insercion"()`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "ck_usuarios_eliminada_desactivada"`);
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "eliminada_en"`);
  }
}
