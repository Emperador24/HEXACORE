import { MigrationInterface, QueryRunner } from 'typeorm';

/** Esquema inicial de Pedidos: materializa las seis entidades actuales de CU-011. */
export class EsquemaInicialCu0111789902006180 implements MigrationInterface {
  name = 'EsquemaInicialCu0111789902006180';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "establecimiento_estado" AS ENUM ('DISPONIBLE', 'CERRADO', 'SATURADO', 'DESHABILITADO')
    `);
    await queryRunner.query(`
      CREATE TYPE "pedido_estado" AS ENUM ('PENDIENTE_PAGO', 'CONFIRMADO', 'EXPIRADO', 'CANCELADO')
    `);
    await queryRunner.query(`
      CREATE TYPE "transaccion_pedido_estado" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FALLIDA')
    `);

    // --- Proyección local del evento ----------------------------------------
    // El identificador pertenece al servicio de Eventos; aquí no se genera.
    await queryRunner.query(`
      CREATE TABLE "eventos_referencia" (
        "evento_id"      uuid PRIMARY KEY,
        "nombre"         varchar(200) NOT NULL,
        "disponible"     boolean NOT NULL DEFAULT false,
        "actualizado_en" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- Establecimientos ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "establecimientos" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "evento_id"     uuid NOT NULL,
        "nombre"        varchar(200) NOT NULL,
        "estado"        "establecimiento_estado" NOT NULL DEFAULT 'DESHABILITADO',
        "punto_entrega" varchar(200) NOT NULL,
        CONSTRAINT "fk_establecimientos_evento"
          FOREIGN KEY ("evento_id") REFERENCES "eventos_referencia" ("evento_id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_establecimientos_evento" ON "establecimientos" ("evento_id")`);

    // --- Productos ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "productos" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "establecimiento_id"  uuid NOT NULL,
        "nombre"              varchar(200) NOT NULL,
        "descripcion"         text NULL,
        "precio"              numeric(12,2) NOT NULL,
        "activo"              boolean NOT NULL DEFAULT false,
        "cantidad_inventario" integer NOT NULL DEFAULT 0,
        CONSTRAINT "fk_productos_establecimiento"
          FOREIGN KEY ("establecimiento_id") REFERENCES "establecimientos" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_productos_precio_positivo"
          CHECK ("precio" > 0 AND "precio" <> 'NaN'::numeric),
        CONSTRAINT "ck_productos_inventario_no_negativo" CHECK ("cantidad_inventario" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_productos_establecimiento" ON "productos" ("establecimiento_id")`);

    // --- Pedidos ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "pedidos" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cliente_id"         uuid NOT NULL,
        "establecimiento_id" uuid NOT NULL,
        "estado"             "pedido_estado" NOT NULL DEFAULT 'PENDIENTE_PAGO',
        "total"              numeric(12,2) NOT NULL,
        "moneda"             varchar(3) NOT NULL,
        "metodo_entrega"     varchar(80) NOT NULL,
        "expira_en"          timestamptz NOT NULL,
        "codigo_qr"          varchar(64) NULL,
        "motivo_cancelacion" text NULL,
        "confirmado_en"      timestamptz NULL,
        "cancelado_en"       timestamptz NULL,
        "creado_en"          timestamptz NOT NULL DEFAULT now(),
        "actualizado_en"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_pedidos_establecimiento"
          FOREIGN KEY ("establecimiento_id") REFERENCES "establecimientos" ("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_pedidos_codigo_qr" UNIQUE ("codigo_qr"),
        CONSTRAINT "ck_pedidos_total_positivo"
          CHECK ("total" > 0 AND "total" <> 'NaN'::numeric),
        CONSTRAINT "ck_pedidos_moneda_formato" CHECK ("moneda" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_pedidos_expiracion_posterior" CHECK ("expira_en" > "creado_en")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_pedidos_cliente" ON "pedidos" ("cliente_id")`);
    await queryRunner.query(`
      CREATE INDEX "idx_pedidos_establecimiento_estado" ON "pedidos" ("establecimiento_id", "estado")
    `);

    // --- Detalles del pedido ------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "detalles_pedido" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id"       uuid NOT NULL,
        "producto_id"     uuid NOT NULL,
        "nombre_producto" varchar(200) NOT NULL,
        "precio_unitario" numeric(12,2) NOT NULL,
        "cantidad"        integer NOT NULL,
        CONSTRAINT "fk_detalles_pedido"
          FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_detalles_producto"
          FOREIGN KEY ("producto_id") REFERENCES "productos" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_detalles_cantidad_positiva" CHECK ("cantidad" > 0),
        CONSTRAINT "ck_detalles_precio_positivo"
          CHECK ("precio_unitario" > 0 AND "precio_unitario" <> 'NaN'::numeric)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_detalles_pedido_producto" ON "detalles_pedido" ("pedido_id", "producto_id")
    `);
    await queryRunner.query(`CREATE INDEX "idx_detalles_producto" ON "detalles_pedido" ("producto_id")`);

    // --- Intentos de pago ---------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "transacciones_pedido" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "pedido_id"           uuid NOT NULL,
        "monto"               numeric(12,2) NOT NULL,
        "moneda"              varchar(3) NOT NULL,
        "estado"              "transaccion_pedido_estado" NOT NULL DEFAULT 'PENDIENTE',
        "referencia_pasarela" varchar(128) NULL,
        "motivo"              text NULL,
        "creada_en"           timestamptz NOT NULL DEFAULT now(),
        "actualizada_en"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_transacciones_pedido"
          FOREIGN KEY ("pedido_id") REFERENCES "pedidos" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_transacciones_pedido_monto_positivo"
          CHECK ("monto" > 0 AND "monto" <> 'NaN'::numeric),
        CONSTRAINT "ck_transacciones_pedido_moneda_formato" CHECK ("moneda" ~ '^[A-Z]{3}$')
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_transacciones_pedido_pedido" ON "transacciones_pedido" ("pedido_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al eliminar cada tabla se eliminan también sus índices y restricciones.
    await queryRunner.query(`DROP TABLE IF EXISTS "transacciones_pedido"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "detalles_pedido"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pedidos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "productos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "establecimientos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eventos_referencia"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaccion_pedido_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pedido_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "establecimiento_estado"`);
  }
}
