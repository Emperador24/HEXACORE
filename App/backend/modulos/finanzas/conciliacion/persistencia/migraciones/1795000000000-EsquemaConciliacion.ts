import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-031 (Gestión de Pagos y Conciliación Financiera), esquema nuevo
 * `finanzas_conciliacion`: duodécimo esquema, sin procedencia histórica.
 *
 * - `conciliaciones`: una corrida por rango de fechas (y módulo opcional),
 *   con sus totales (pasos 3-5) y el outbox (`despachada_en`) para la
 *   comparación asíncrona vía cola (infraestructura no trivial).
 * - `conciliacion_items`: cada transacción comparada, CONCILIADO, con
 *   DIFERENCIA o HUERFANA (CU-031B: está en la pasarela y no en el sistema).
 * - `reembolsos_administrativos`: paso 6-9, con su propia clave de
 *   idempotencia para reutilizar `PagosService.reembolsar` sin duplicar
 *   lógica de pagos.
 * - `bitacora_conciliacion`: auditoría (Seguridad/Trazabilidad).
 */
export class EsquemaConciliacion1795000000000 implements MigrationInterface {
  name = 'EsquemaConciliacion1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "conciliaciones" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "desde" TIMESTAMP WITH TIME ZONE NOT NULL,
      "hasta" TIMESTAMP WITH TIME ZONE NOT NULL,
      "modulo" character varying(20),
      "estado" character varying(24) NOT NULL DEFAULT 'EN_PROCESO',
      "total" integer NOT NULL DEFAULT 0,
      "coincidentes" integer NOT NULL DEFAULT 0,
      "con_diferencia" integer NOT NULL DEFAULT 0,
      "huerfanas" integer NOT NULL DEFAULT 0,
      "solicitada_por" uuid NOT NULL,
      "solicitada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "despachada_en" TIMESTAMP WITH TIME ZONE,
      "procesada_en" TIMESTAMP WITH TIME ZONE,
      "cerrada_por" uuid,
      "cerrada_en" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "PK_conciliaciones" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_conciliaciones_rango" CHECK ("hasta" > "desde"),
      CONSTRAINT "CHK_conciliaciones_modulo" CHECK ("modulo" IS NULL OR "modulo" IN ('entradas', 'alimentos', 'parqueaderos')),
      CONSTRAINT "CHK_conciliaciones_estado" CHECK ("estado" IN ('EN_PROCESO', 'LISTA', 'CONCILIADA_AUTOMATICA', 'CERRADA'))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_conciliaciones_pendientes" ON "conciliaciones" ("solicitada_en") WHERE "despachada_en" IS NULL`);

    await queryRunner.query(`CREATE TABLE "conciliacion_items" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "conciliacion_id" uuid NOT NULL,
      "clave_idempotencia" character varying(128),
      "referencia_pasarela" character varying(128),
      "tipo" character varying(10) NOT NULL,
      "estado_item" character varying(12) NOT NULL,
      "monto_sistema" numeric(12,2),
      "monto_pasarela" numeric(12,2),
      "moneda" character varying(3),
      "detalle" text,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_conciliacion_items" PRIMARY KEY ("id"),
      CONSTRAINT "FK_conciliacion_items" FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_conciliacion_items_tipo" CHECK ("tipo" IN ('COBRO', 'REEMBOLSO')),
      CONSTRAINT "CHK_conciliacion_items_estado" CHECK ("estado_item" IN ('CONCILIADO', 'DIFERENCIA', 'HUERFANA'))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_conciliacion_items_conciliacion" ON "conciliacion_items" ("conciliacion_id", "estado_item")`);

    await queryRunner.query(`CREATE TABLE "reembolsos_administrativos" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "conciliacion_item_id" uuid,
      "clave_idempotencia" character varying(128) NOT NULL,
      "clave_transaccion_original" character varying(128) NOT NULL,
      "monto" numeric(12,2) NOT NULL,
      "moneda" character varying(3) NOT NULL,
      "justificacion" text NOT NULL,
      "aprobado_por" uuid NOT NULL,
      "aprobado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "resultado" character varying(14) NOT NULL,
      "referencia_pasarela" character varying(128),
      "notificado_en" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "PK_reembolsos_administrativos" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_reembolsos_administrativos_clave" UNIQUE ("clave_idempotencia"),
      CONSTRAINT "FK_reembolsos_administrativos_item" FOREIGN KEY ("conciliacion_item_id") REFERENCES "conciliacion_items"("id") ON DELETE SET NULL,
      CONSTRAINT "CHK_reembolsos_administrativos_monto" CHECK ("monto" > 0),
      CONSTRAINT "CHK_reembolsos_administrativos_resultado" CHECK ("resultado" IN ('APROBADO', 'RECHAZADO', 'INDETERMINADO'))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_reembolsos_administrativos_item" ON "reembolsos_administrativos" ("conciliacion_item_id")`);

    await queryRunner.query(`CREATE TABLE "bitacora_conciliacion" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "conciliacion_id" uuid,
      "tipo" character varying(30) NOT NULL,
      "detalle" jsonb NOT NULL DEFAULT '{}',
      "realizado_por" uuid,
      "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT "PK_bitacora_conciliacion" PRIMARY KEY ("id"),
      CONSTRAINT "FK_bitacora_conciliacion" FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_bitacora_conciliacion" ON "bitacora_conciliacion" ("conciliacion_id", "fecha")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bitacora_conciliacion"`);
    await queryRunner.query(`DROP TABLE "reembolsos_administrativos"`);
    await queryRunner.query(`DROP TABLE "conciliacion_items"`);
    await queryRunner.query(`DROP TABLE "conciliaciones"`);
  }
}
