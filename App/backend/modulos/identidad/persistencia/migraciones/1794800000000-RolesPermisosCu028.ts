import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-028 · Gestión de roles y permisos.
 *
 * - `roles.version`: control de concurrencia optimista. Dos administradores
 *   que editan el mismo rol a la vez no se pisan: el segundo recibe un 409 y
 *   ve lo que guardó el primero.
 * - `permisos_roles`: la matriz por módulo y acción (paso 4) de los roles
 *   propios. Los cuatro del sistema no tienen filas: su comportamiento lo
 *   declara el código, y la base lo impide con el disparador de abajo.
 * - `auditoria_roles`: post-condición 2 y trazabilidad (*"quién, cuándo, qué
 *   cambió"*). De solo inserción, como `auditoria_cuentas`. No referencia el
 *   rol con llave foránea porque debe sobrevivir a que se elimine.
 */
export class RolesPermisosCu0281794800000000 implements MigrationInterface {
  name = 'RolesPermisosCu0281794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "roles"
        ADD COLUMN "version" integer NOT NULL DEFAULT 1,
        ADD COLUMN "actualizado_en" timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT "ck_roles_version" CHECK ("version" >= 1)
    `);

    await queryRunner.query(`
      CREATE TABLE "permisos_roles" (
        "rol_id" uuid NOT NULL,
        "modulo" varchar(30) NOT NULL,
        "accion" varchar(12) NOT NULL,
        CONSTRAINT "pk_permisos_roles" PRIMARY KEY ("rol_id", "modulo", "accion"),
        CONSTRAINT "fk_permisos_roles_rol" FOREIGN KEY ("rol_id") REFERENCES "roles" ("id") ON DELETE CASCADE,
        CONSTRAINT "ck_permisos_roles_modulo"
          CHECK ("modulo" IN ('eventos', 'personal', 'parqueaderos', 'emergencias', 'reportes')),
        CONSTRAINT "ck_permisos_roles_accion"
          CHECK ("accion" IN ('leer', 'crear', 'actualizar', 'eliminar'))
      )
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "permisos_roles_solo_propios"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "roles" WHERE "id" = NEW."rol_id" AND "del_sistema") THEN
          RAISE EXCEPTION 'Los roles del sistema no tienen matriz de permisos'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "tr_permisos_roles_solo_propios"
        BEFORE INSERT OR UPDATE ON "permisos_roles"
        FOR EACH ROW EXECUTE FUNCTION "permisos_roles_solo_propios"()
    `);

    await queryRunner.query(`
      CREATE TABLE "auditoria_roles" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "rol_id"        uuid NOT NULL,
        "rol_nombre"    varchar(40) NOT NULL,
        "accion"        varchar(20) NOT NULL,
        "detalle"       jsonb NOT NULL DEFAULT '{}'::jsonb,
        "realizada_por" uuid NOT NULL,
        "fecha"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_auditoria_roles_autor"
          FOREIGN KEY ("realizada_por") REFERENCES "usuarios" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_auditoria_roles_accion"
          CHECK ("accion" IN ('CREAR', 'EDITAR', 'ELIMINAR', 'ASIGNAR', 'RETIRAR'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_roles_rol" ON "auditoria_roles" ("rol_id", "fecha" DESC)`);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "auditoria_roles_solo_insercion"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'auditoria_roles es de solo inserción (% no permitido)', TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER "tr_auditoria_roles_solo_insercion"
        BEFORE UPDATE OR DELETE ON "auditoria_roles"
        FOR EACH ROW EXECUTE FUNCTION "auditoria_roles_solo_insercion"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_roles"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "auditoria_roles_solo_insercion"()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permisos_roles"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "permisos_roles_solo_propios"()`);
    await queryRunner.query(`
      ALTER TABLE "roles"
        DROP CONSTRAINT IF EXISTS "ck_roles_version",
        DROP COLUMN IF EXISTS "actualizado_en",
        DROP COLUMN IF EXISTS "version"
    `);
  }
}
