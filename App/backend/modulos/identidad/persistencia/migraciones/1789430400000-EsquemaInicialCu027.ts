import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial del Servicio de Administración (CU-027 y CU-028).
 *
 * Se escribe a mano, como la del CU-006, porque lo que más importa aquí no lo
 * genera `migration:generate`: el índice único sobre el correo en minúsculas,
 * las restricciones que mantienen coherente el estado de una cuenta, y los
 * cuatro roles de base — que no son datos de prueba sino parte del esquema,
 * porque sin el rol `Cliente` el paso 4 del CU-027 no puede asignar el rol por
 * defecto y el registro queda inutilizable.
 */
export class EsquemaInicialCu0271789430400000 implements MigrationInterface {
  name = 'EsquemaInicialCu0271789430400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "estado_cuenta" AS ENUM ('PENDIENTE_VERIFICACION', 'ACTIVA', 'DESACTIVADA')
    `);
    await queryRunner.query(`
      CREATE TYPE "tipo_token" AS ENUM ('VERIFICACION', 'RECUPERACION')
    `);

    // --- Roles (SAD §12) ----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre"      varchar(40) NOT NULL,
        "descripcion" varchar(200) NOT NULL,
        "del_sistema" boolean NOT NULL DEFAULT false,
        "creado_en"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_roles_nombre" UNIQUE ("nombre")
      )
    `);

    // Los cuatro roles de base. Van en la migración y no en la semilla porque
    // el registro (paso 4) depende de que exista "Cliente": sin él, una base
    // recién migrada no admitiría ni una sola cuenta.
    await queryRunner.query(`
      INSERT INTO "roles" ("nombre", "descripcion", "del_sistema") VALUES
        ('Cliente',       'Compra entradas, parqueadero y pedidos. Rol por defecto al registrarse.', true),
        ('Personal',      'Personal operativo del evento: ingreso, parqueadero, restaurante.',        true),
        ('Organizador',   'Crea y gestiona eventos, zonas y aforo.',                                  true),
        ('Administrador', 'Administra cuentas, roles, proveedores y reportes.',                       true)
    `);

    // --- Usuarios -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "nombre"            varchar(160) NOT NULL,
        "email"             varchar(254) NOT NULL,
        "hash_contrasena"   varchar(255) NOT NULL,
        "estado"            "estado_cuenta" NOT NULL DEFAULT 'PENDIENTE_VERIFICACION',
        "verificado_en"     timestamptz NULL,
        "intentos_fallidos" integer NOT NULL DEFAULT 0,
        "bloqueada_hasta"   timestamptz NULL,
        "ultimo_acceso_en"  timestamptz NULL,
        "creado_en"         timestamptz NOT NULL DEFAULT now(),
        "actualizado_en"    timestamptz NOT NULL DEFAULT now(),

        -- El correo se guarda ya en minúsculas, pero la restricción lo exige
        -- en la base: si algún camino olvidara normalizarlo, "Ana@x.com" y
        -- "ana@x.com" serían dos cuentas y el paso 3 del CU-027 ("verifica que
        -- el correo no esté registrado") se saltaría con una mayúscula.
        CONSTRAINT "ck_usuarios_email_minusculas" CHECK ("email" = lower("email")),

        -- Una forma mínima de correo. No valida que exista, solo que tenga
        -- forma de correo: lo contrario permitiría registrar basura que luego
        -- hace fallar el envío de verificación.
        CONSTRAINT "ck_usuarios_email_forma" CHECK ("email" LIKE '%_@_%.__%'),

        CONSTRAINT "ck_usuarios_intentos_no_negativos" CHECK ("intentos_fallidos" >= 0),

        -- Una cuenta verificada tiene fecha de verificación, y al revés. Sin
        -- esto, una cuenta podría quedar ACTIVA sin haber confirmado el correo
        -- —saltándose los pasos 5-7— y nadie lo notaría.
        CONSTRAINT "ck_usuarios_verificacion_coherente" CHECK (
          ("estado" = 'PENDIENTE_VERIFICACION' AND "verificado_en" IS NULL) OR
          ("estado" <> 'PENDIENTE_VERIFICACION' AND "verificado_en" IS NOT NULL)
        )
      )
    `);

    // Único sobre el correo. Como la columna ya está forzada a minúsculas por
    // el CHECK de arriba, este índice es efectivamente insensible a mayúsculas.
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_usuarios_email" ON "usuarios" ("email")`);

    // --- Asignación de roles (SAD §12) --------------------------------------
    await queryRunner.query(`
      CREATE TABLE "usuarios_roles" (
        "usuario_id"   uuid NOT NULL,
        "rol_id"       uuid NOT NULL,
        "asignado_por" uuid NULL,
        "asignado_en"  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("usuario_id", "rol_id"),
        CONSTRAINT "fk_usuarios_roles_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE,
        -- RESTRICT y no CASCADE: CU-028A exige que eliminar un rol con usuarios
        -- asignados falle y obligue a reasignarlos primero.
        CONSTRAINT "fk_usuarios_roles_rol"
          FOREIGN KEY ("rol_id") REFERENCES "roles" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_usuarios_roles_rol" ON "usuarios_roles" ("rol_id")`);

    // --- Sesiones (paso 9: "registra el inicio de sesión") ------------------
    await queryRunner.query(`
      CREATE TABLE "sesiones" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuario_id"     uuid NOT NULL,
        "jti"            uuid NOT NULL,
        "emitida_en"     timestamptz NOT NULL DEFAULT now(),
        "expira_en"      timestamptz NOT NULL,
        "revocada_en"    timestamptz NULL,
        "direccion_ip"   varchar(45) NULL,
        "agente_usuario" varchar(255) NULL,
        "creada_en"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_sesiones_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE,
        -- Una sesión que caduca antes de emitirse no tiene sentido y apuntaría
        -- a un error de cálculo de la expiración.
        CONSTRAINT "ck_sesiones_expira_despues" CHECK ("expira_en" > "emitida_en")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_sesiones_jti" ON "sesiones" ("jti")`);
    await queryRunner.query(`CREATE INDEX "idx_sesiones_usuario" ON "sesiones" ("usuario_id")`);

    // --- Enlaces de verificación y recuperación -----------------------------
    await queryRunner.query(`
      CREATE TABLE "tokens_cuenta" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "tipo"       "tipo_token" NOT NULL,
        "hash_token" varchar(64) NOT NULL,
        "expira_en"  timestamptz NOT NULL,
        "usado_en"   timestamptz NULL,
        "creado_en"  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_tokens_usuario"
          FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE,
        CONSTRAINT "ck_tokens_expira_despues" CHECK ("expira_en" > "creado_en"),
        -- El hash es SHA-256 en hexadecimal: exactamente 64 caracteres. Si
        -- alguna vez se guardara aquí el token en claro, sería de otra longitud
        -- y la inserción fallaría — una red contra el peor error posible en
        -- esta tabla.
        CONSTRAINT "ck_tokens_hash_es_sha256" CHECK ("hash_token" ~ '^[0-9a-f]{64}$')
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_tokens_hash" ON "tokens_cuenta" ("hash_token")`);
    await queryRunner.query(`CREATE INDEX "idx_tokens_usuario" ON "tokens_cuenta" ("usuario_id", "tipo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tokens_cuenta"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sesiones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_token"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "estado_cuenta"`);
  }
}
