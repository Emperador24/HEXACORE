import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-010 (Gestionar evacuación ante emergencias), esquema `operacion`.
 *
 * Plan de evacuación del recinto (precondición 1), referido por id a las
 * zonas de eventos-recintos (CU-029) sin FK entre esquemas:
 * - `salidas_emergencia`: salidas del recinto y si están habilitadas (CU-010A).
 * - `rutas_evacuacion`: qué salidas sirven a cada zona, por prioridad.
 *
 * Protocolo:
 * - `evacuaciones`: una por emergencia, con quién la activó y la finalizó y su
 *   reporte (post-condiciones 1-3). Solo una abierta por evento.
 * - `evacuacion_zonas`: estado de cada zona afectada y la ruta que se le indicó.
 * - `notificaciones_evacuacion`: bandeja de salida de los avisos (paso 8-9). Se
 *   guardan con el protocolo y luego se publican: si RabbitMQ no está, quedan
 *   pendientes y se reintentan (tolerancia a fallos).
 * - `bitacora_evacuacion`: todo lo que pasó, en orden, para la auditoría.
 */
export class Cu010Evacuacion1794100000000 implements MigrationInterface {
  name = 'Cu010Evacuacion1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "salidas_emergencia" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recinto_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "capacidad_por_minuto" integer, "habilitada" boolean NOT NULL DEFAULT true, "motivo_bloqueo" text, "actualizado_por" uuid, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_salidas_emergencia" PRIMARY KEY ("id"), CONSTRAINT "CHK_salidas_capacidad" CHECK ("capacidad_por_minuto" IS NULL OR "capacidad_por_minuto" > 0))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_salidas_recinto_nombre" ON "salidas_emergencia" ("recinto_id", lower("nombre"))`);

    await queryRunner.query(`CREATE TABLE "rutas_evacuacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recinto_id" uuid NOT NULL, "zona_id" uuid NOT NULL, "salida_id" uuid NOT NULL, "prioridad" integer NOT NULL DEFAULT 1, "descripcion" text, CONSTRAINT "PK_rutas_evacuacion" PRIMARY KEY ("id"), CONSTRAINT "FK_rutas_salida" FOREIGN KEY ("salida_id") REFERENCES "salidas_emergencia"("id") ON DELETE CASCADE, CONSTRAINT "UQ_rutas_zona_salida" UNIQUE ("zona_id", "salida_id"), CONSTRAINT "CHK_rutas_prioridad" CHECK ("prioridad" >= 1))`);
    await queryRunner.query(`CREATE INDEX "IDX_rutas_recinto" ON "rutas_evacuacion" ("recinto_id", "zona_id", "prioridad")`);

    await queryRunner.query(`CREATE TABLE "evacuaciones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "recinto_id" uuid NOT NULL, "tipo" character varying(40) NOT NULL, "ubicacion" text NOT NULL, "nivel" integer NOT NULL, "alcance" character varying(10) NOT NULL, "zona_origen_id" uuid, "estado" character varying(12) NOT NULL DEFAULT 'PROPUESTA', "descripcion" text, "creada_por" uuid NOT NULL, "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "activada_por" uuid, "activada_en" TIMESTAMP WITH TIME ZONE, "finalizada_por" uuid, "finalizada_en" TIMESTAMP WITH TIME ZONE, "observaciones" text, "reporte" jsonb, CONSTRAINT "PK_evacuaciones" PRIMARY KEY ("id"), CONSTRAINT "CHK_evacuaciones_nivel" CHECK ("nivel" BETWEEN 1 AND 3), CONSTRAINT "CHK_evacuaciones_alcance" CHECK ("alcance" IN ('PARCIAL', 'TOTAL')), CONSTRAINT "CHK_evacuaciones_estado" CHECK ("estado" IN ('PROPUESTA', 'ACTIVA', 'FINALIZADA', 'DESCARTADA')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_evacuaciones_abierta" ON "evacuaciones" ("evento_id") WHERE "estado" IN ('PROPUESTA', 'ACTIVA')`);
    await queryRunner.query(`CREATE INDEX "IDX_evacuaciones_evento" ON "evacuaciones" ("evento_id", "creada_en")`);

    await queryRunner.query(`CREATE TABLE "evacuacion_zonas" ("evacuacion_id" uuid NOT NULL, "zona_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "capacidad" integer NOT NULL, "ocupacion_estimada" integer NOT NULL DEFAULT 0, "personas_restantes" integer NOT NULL DEFAULT 0, "estado" character varying(10) NOT NULL DEFAULT 'PENDIENTE', "salida_id" uuid, "salida_nombre" character varying(120), "instruccion" text, "incorporada_en_nivel" integer NOT NULL DEFAULT 1, "actualizado_por" uuid, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_evacuacion_zonas" PRIMARY KEY ("evacuacion_id", "zona_id"), CONSTRAINT "FK_evacuacion_zonas" FOREIGN KEY ("evacuacion_id") REFERENCES "evacuaciones"("id") ON DELETE CASCADE, CONSTRAINT "CHK_evacuacion_zonas_estado" CHECK ("estado" IN ('PENDIENTE', 'EN_CURSO', 'EVACUADA')), CONSTRAINT "CHK_evacuacion_zonas_personas" CHECK ("personas_restantes" >= 0))`);

    await queryRunner.query(`CREATE TABLE "notificaciones_evacuacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evacuacion_id" uuid NOT NULL, "canal" character varying(12) NOT NULL, "zona_id" uuid, "mensaje" text NOT NULL, "prioridad" integer NOT NULL, "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "publicada_en" TIMESTAMP WITH TIME ZONE, "entregada_en" TIMESTAMP WITH TIME ZONE, "intentos" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_notificaciones_evacuacion" PRIMARY KEY ("id"), CONSTRAINT "FK_notificaciones_evacuacion" FOREIGN KEY ("evacuacion_id") REFERENCES "evacuaciones"("id") ON DELETE CASCADE, CONSTRAINT "CHK_notificaciones_canal" CHECK ("canal" IN ('PERSONAL', 'ASISTENTES', 'ALTAVOCES')))`);
    await queryRunner.query(`CREATE INDEX "IDX_notificaciones_pendientes" ON "notificaciones_evacuacion" ("creada_en") WHERE "publicada_en" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_notificaciones_evacuacion" ON "notificaciones_evacuacion" ("evacuacion_id", "creada_en")`);

    await queryRunner.query(`CREATE TABLE "bitacora_evacuacion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evacuacion_id" uuid NOT NULL, "tipo" character varying(30) NOT NULL, "detalle" jsonb NOT NULL DEFAULT '{}', "realizado_por" uuid, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(), CONSTRAINT "PK_bitacora_evacuacion" PRIMARY KEY ("id"), CONSTRAINT "FK_bitacora_evacuacion" FOREIGN KEY ("evacuacion_id") REFERENCES "evacuaciones"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE INDEX "IDX_bitacora_evacuacion" ON "bitacora_evacuacion" ("evacuacion_id", "fecha")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bitacora_evacuacion"`);
    await queryRunner.query(`DROP TABLE "notificaciones_evacuacion"`);
    await queryRunner.query(`DROP TABLE "evacuacion_zonas"`);
    await queryRunner.query(`DROP TABLE "evacuaciones"`);
    await queryRunner.query(`DROP TABLE "rutas_evacuacion"`);
    await queryRunner.query(`DROP TABLE "salidas_emergencia"`);
  }
}
