import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-020 (Gestionar incidentes), esquema `operacion`.
 *
 * - `incidentes`: tipo, ubicación y descripción (paso 1), con prioridad
 *   inicial calculada por el sistema (paso 2) y estado del ciclo
 *   ABIERTO → EN_ATENCION → RESUELTO → CERRADO (paso 8). CU-020B permite
 *   saltar directo a CERRADO con una nota de resolución, sin escalar.
 * - `bitacora_incidentes`: historial completo para auditoría (paso 9), igual
 *   que `bitacora_evacuacion` en CU-010.
 * - `notificaciones_incidentes`: bandeja de salida de los avisos al
 *   supervisor (paso 3) y al responsable (paso 6), con prioridad: un
 *   incidente CRÍTICO se entrega antes que uno de prioridad BAJA.
 */
export class Cu020Incidentes1794900000000 implements MigrationInterface {
  name = 'Cu020Incidentes1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "incidentes" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "evento_id" uuid NOT NULL,
      "tipo" character varying(120) NOT NULL,
      "ubicacion" text NOT NULL,
      "descripcion" text NOT NULL,
      "prioridad" character varying(10) NOT NULL,
      "estado" character varying(12) NOT NULL DEFAULT 'ABIERTO',
      "reportado_por" uuid NOT NULL,
      "responsable_id" uuid,
      "asignado_por" uuid,
      "asignado_en" TIMESTAMP WITH TIME ZONE,
      "nota_resolucion" text,
      "cerrado_por" uuid,
      "cerrado_en" TIMESTAMP WITH TIME ZONE,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_incidentes" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_incidentes_prioridad" CHECK ("prioridad" IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
      CONSTRAINT "CHK_incidentes_estado" CHECK ("estado" IN ('ABIERTO', 'EN_ATENCION', 'RESUELTO', 'CERRADO'))
    )`);
    // Paso 9 / CU-020A: listar abiertos por prioridad y antigüedad es la consulta de todos los días.
    await queryRunner.query(`CREATE INDEX "IDX_incidentes_evento_estado" ON "incidentes" ("evento_id", "estado", "prioridad", "creado_en")`);
    await queryRunner.query(`CREATE INDEX "IDX_incidentes_responsable" ON "incidentes" ("responsable_id") WHERE "responsable_id" IS NOT NULL`);

    await queryRunner.query(`CREATE TABLE "bitacora_incidentes" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "incidente_id" uuid NOT NULL,
      "tipo" character varying(30) NOT NULL,
      "detalle" jsonb NOT NULL DEFAULT '{}',
      "realizado_por" uuid,
      "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT "PK_bitacora_incidentes" PRIMARY KEY ("id"),
      CONSTRAINT "FK_bitacora_incidentes" FOREIGN KEY ("incidente_id") REFERENCES "incidentes"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_bitacora_incidentes" ON "bitacora_incidentes" ("incidente_id", "fecha")`);

    await queryRunner.query(`CREATE TABLE "notificaciones_incidentes" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "incidente_id" uuid NOT NULL,
      "destinatario" character varying(20) NOT NULL,
      "mensaje" text NOT NULL,
      "prioridad" integer NOT NULL,
      "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "publicada_en" TIMESTAMP WITH TIME ZONE,
      "entregada_en" TIMESTAMP WITH TIME ZONE,
      "intentos" integer NOT NULL DEFAULT 0,
      CONSTRAINT "PK_notificaciones_incidentes" PRIMARY KEY ("id"),
      CONSTRAINT "FK_notificaciones_incidentes" FOREIGN KEY ("incidente_id") REFERENCES "incidentes"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_notificaciones_incidentes_destinatario" CHECK ("destinatario" IN ('SUPERVISOR', 'RESPONSABLE'))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_notificaciones_incidentes_pendientes" ON "notificaciones_incidentes" ("creada_en") WHERE "publicada_en" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_notificaciones_incidentes" ON "notificaciones_incidentes" ("incidente_id", "creada_en")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notificaciones_incidentes"`);
    await queryRunner.query(`DROP TABLE "bitacora_incidentes"`);
    await queryRunner.query(`DROP TABLE "incidentes"`);
  }
}
