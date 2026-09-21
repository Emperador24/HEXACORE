import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Compra CU-001, Validación de QR CU-002, cancelaciones CU-003 
 * y promociones CU-004
 * Reglas
 * no vender por encima del aforo, no pasarse del límite de usos de un cupón,
 * no registrar dos ingresos con la misma entrada, no dejar entrar a más gente que el aforo.
 */
export class VentaPrimariaCu001a0041789862400000 implements MigrationInterface {
  name = 'VentaPrimariaCu001a0041789862400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "compra_estado" AS ENUM
        ('PENDIENTE', 'PAGANDO', 'PAGADA', 'EXPIRADA', 'CANCELADA', 'PARCIALMENTE_CANCELADA')
    `);
    await queryRunner.query(`CREATE TYPE "uso_promocion_estado" AS ENUM ('RESERVADO', 'CONFIRMADO', 'LIBERADO')`);
    await queryRunner.query(`CREATE TYPE "ingreso_origen" AS ENUM ('EN_LINEA', 'SINCRONIZADO')`);
    await queryRunner.query(`CREATE TYPE "cancelacion_estado" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FALLIDA')`);

    // Los de ticket arrancan en 1000, CU-006 ya usa TCK-2026-000001..000008 con números fijos.
    await queryRunner.query(`CREATE SEQUENCE "numero_compra_seq" START 1`);
    await queryRunner.query(`CREATE SEQUENCE "numero_ticket_seq" START 1000`);

    // reservas separadas de ventas CU-001
    // garantía contra sobreventa
    // reserva sin pagar ocupa cupo igual que una venta.
    await queryRunner.query(`
      ALTER TABLE "localidades_evento"
        ADD COLUMN "reservadas" integer NOT NULL DEFAULT 0,
        DROP CONSTRAINT "ck_localidades_vendidas_en_rango",
        ADD CONSTRAINT "ck_localidades_cupo_en_rango" CHECK (
          "vendidas" >= 0 AND "reservadas" >= 0 AND "vendidas" + "reservadas" <= "aforo"
        )
    `);

    // Aforo CU-002
    await queryRunner.query(`
      ALTER TABLE "eventos_referencia"
        ADD COLUMN "aforo_maximo" integer NULL,
        ADD COLUMN "asistentes" integer NOT NULL DEFAULT 0,
        ADD CONSTRAINT "ck_eventos_aforo_positivo" CHECK ("aforo_maximo" IS NULL OR "aforo_maximo" > 0),
        -- Nadie entra si el aforo esta lleno CU-002B
        ADD CONSTRAINT "ck_eventos_asistentes_en_rango" CHECK (
          "asistentes" >= 0 AND ("aforo_maximo" IS NULL OR "asistentes" <= "aforo_maximo")
        )
    `);

    // Compras CU-001
    await queryRunner.query(`
      CREATE TABLE "compras" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "numero_compra" varchar(32) NOT NULL,
        "comprador_id" uuid NOT NULL,
        "evento_id" uuid NOT NULL,
        "localidad_id" uuid NOT NULL,
        "cantidad" integer NOT NULL,
        "precio_unitario" numeric(12,2) NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "descuento" numeric(12,2) NOT NULL DEFAULT 0,
        "total" numeric(12,2) NOT NULL,
        "codigo_promocional" varchar(40) NULL,
        "estado" "compra_estado" NOT NULL DEFAULT 'PENDIENTE',
        "intentos_rechazados" integer NOT NULL DEFAULT 0,
        "referencia_pasarela" varchar(128) NULL,
        "motivo" text NULL,
        "expira_en" timestamptz NOT NULL,
        "pagada_en" timestamptz NULL,
        "creada_en" timestamptz NOT NULL DEFAULT now(),
        "actualizada_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_compras_numero" UNIQUE ("numero_compra"),
        CONSTRAINT "ck_compras_cantidad" CHECK ("cantidad" BETWEEN 1 AND 10),
        CONSTRAINT "ck_compras_subtotal_cuadra" CHECK ("subtotal" = "precio_unitario" * "cantidad"),
        CONSTRAINT "ck_compras_descuento_en_rango" CHECK ("descuento" >= 0 AND "descuento" < "subtotal"),
        CONSTRAINT "ck_compras_total_cuadra" CHECK ("total" = "subtotal" - "descuento"),
        -- Una compra pagada siempre tiene la referencia del cobro
        -- sin ella no se puede reembolsar ni conciliar CU-003 
        CONSTRAINT "ck_compras_pagada_con_referencia" CHECK (
          "estado" NOT IN ('PAGADA', 'CANCELADA', 'PARCIALMENTE_CANCELADA') OR "referencia_pasarela" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_compras_comprador" ON "compras" ("comprador_id")`);
    // barrido de reservas vencidas
    await queryRunner.query(`
      CREATE INDEX "idx_compras_reservas_vivas" ON "compras" ("expira_en") WHERE "estado" = 'PENDIENTE'
    `);

    // compras que salieron
    await queryRunner.query(`
      ALTER TABLE "entradas"
        ADD COLUMN "compra_id" uuid NULL,
        ADD CONSTRAINT "fk_entradas_compra" FOREIGN KEY ("compra_id") REFERENCES "compras" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "idx_entradas_compra" ON "entradas" ("compra_id")`);

    // Promociones CU-004
    await queryRunner.query(`
      CREATE TABLE "codigos_promocionales" (
        "codigo" varchar(40)  PRIMARY KEY,
        "descripcion" varchar(200) NOT NULL,
        "porcentaje" integer NOT NULL,
        "evento_id" uuid NULL,
        "localidad_id" uuid NULL,
        "vigente_desde" timestamptz NOT NULL,
        "vigente_hasta" timestamptz NOT NULL,
        "limite_usos" integer NULL,
        "usos" integer NOT NULL DEFAULT 0,
        "activo" boolean NOT NULL DEFAULT true,
        "creado_en" "timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "ck_promociones_codigo_mayusculas" CHECK ("codigo" = upper("codigo")),
        CONSTRAINT "ck_promociones_porcentaje" CHECK ("porcentaje" BETWEEN 1 AND 90),
        CONSTRAINT "ck_promociones_vigencia" CHECK ("vigente_hasta" > "vigente_desde"),
        -- LIMITE DE USOS CON CONCURRENCIA CU-004D
        CONSTRAINT "ck_promociones_usos_en_rango" CHECK (
          "usos" >= 0 AND ("limite_usos" IS NULL OR "usos" <= "limite_usos")
        ),
        CONSTRAINT "ck_promociones_limite_positivo" CHECK ("limite_usos" IS NULL OR "limite_usos" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "usos_promocion" (
        "id"             bigserial PRIMARY KEY,
        "codigo"         varchar(40)            NOT NULL,
        "compra_id"      uuid                   NOT NULL,
        "usuario_id"     uuid                   NOT NULL,
        "descuento"      numeric(12,2)          NOT NULL,
        "estado"         "uso_promocion_estado" NOT NULL,
        "registrado_en"  timestamptz            NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz            NOT NULL DEFAULT now(),
        CONSTRAINT "fk_usos_codigo" FOREIGN KEY ("codigo") REFERENCES "codigos_promocionales" ("codigo") ON DELETE RESTRICT,
        CONSTRAINT "fk_usos_compra" FOREIGN KEY ("compra_id") REFERENCES "compras" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_usos_descuento_positivo" CHECK ("descuento" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_usos_promocion_codigo" ON "usos_promocion" ("codigo")`);
    // Un cupon por compra
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_uso_vivo_por_compra" ON "usos_promocion" ("compra_id") WHERE "estado" <> 'LIBERADO'`);

    // Ingresos CU-002
    await queryRunner.query(`
      CREATE TABLE "ingresos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entrada_id" uuid NOT NULL,
        "evento_id" uuid NOT NULL,
        "validado_por" uuid NOT NULL,
        "punto_acceso" varchar(60) NULL,
        "origen" "ingreso_origen" NOT NULL,
        "escaneado_en" timestamptz NOT NULL,
        "registrado_en" timestamptz NOT NULL DEFAULT now(),
        -- una entrada = un ingreso si dos puertas escaneen el mismo QR en
        -- el mismo milisegundo el segundo falla
        CONSTRAINT "uq_ingresos_entrada" UNIQUE ("entrada_id"),
        CONSTRAINT "fk_ingresos_entrada" FOREIGN KEY ("entrada_id") REFERENCES "entradas" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ingresos_evento" ON "ingresos" ("evento_id")`);

    // Cancelaciones CU-003
    await queryRunner.query(`
      CREATE TABLE "cancelaciones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "compra_id" uuid NOT NULL,
        "solicitante_id" uuid NOT NULL,
        "entradas_ids" uuid[] NOT NULL,
        "porcentaje_reembolso" integer NOT NULL,
        "monto_reembolso" numeric(12,2) NOT NULL,
        "motivo" varchar(500) NOT NULL,
        "estado" "cancelacion_estado" NOT NULL,
        "referencia_pasarela" varchar(128) NULL,
        "motivo_pasarela" text NULL,
        "creada_en" timestamptz NOT NULL DEFAULT now(),
        "actualizada_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_cancelaciones_compra" FOREIGN KEY ("compra_id") REFERENCES "compras" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_cancelaciones_con_entradas" CHECK (cardinality("entradas_ids") > 0),
        CONSTRAINT "ck_cancelaciones_porcentaje" CHECK ("porcentaje_reembolso" BETWEEN 1 AND 100),
        CONSTRAINT "ck_cancelaciones_monto_positivo" CHECK ("monto_reembolso" > 0),
        -- Trazabilidad para rembolsos
        CONSTRAINT "ck_cancelaciones_aprobada_con_referencia" CHECK (
          "estado" <> 'APROBADA' OR "referencia_pasarela" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_cancelaciones_compra" ON "cancelaciones" ("compra_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cancelaciones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ingresos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usos_promocion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "codigos_promocionales"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_entradas_compra"`);
    await queryRunner.query(`
      ALTER TABLE "entradas" DROP CONSTRAINT IF EXISTS "fk_entradas_compra", DROP COLUMN IF EXISTS "compra_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "compras"`);
    await queryRunner.query(`
      ALTER TABLE "eventos_referencia"
        DROP CONSTRAINT IF EXISTS "ck_eventos_asistentes_en_rango",
        DROP CONSTRAINT IF EXISTS "ck_eventos_aforo_positivo",
        DROP COLUMN IF EXISTS "asistentes",
        DROP COLUMN IF EXISTS "aforo_maximo"
    `);
    
    await queryRunner.query(`
      ALTER TABLE "localidades_evento"
        DROP CONSTRAINT IF EXISTS "ck_localidades_cupo_en_rango",
        DROP COLUMN IF EXISTS "reservadas",
        ADD CONSTRAINT "ck_localidades_vendidas_en_rango" CHECK ("vendidas" >= 0 AND "vendidas" <= "aforo")
    `);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "numero_ticket_seq"`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "numero_compra_seq"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cancelacion_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ingreso_origen"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "uso_promocion_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "compra_estado"`);
  }
}
