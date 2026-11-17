import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-016 (Planificar logística del evento) y CU-030 (Gestión de Proveedores),
 * esquema `personal_logistica`.
 *
 * - `proveedores` / `documentos_proveedor`: catálogo externo (CU-030), con sus
 *   certificaciones guardadas en base (mismo patrón que `planos_recinto` de
 *   CU-029: no hay un servicio de objetos aparte en esta instalación).
 * - `recursos_logisticos`: catálogo de recursos materiales (equipo, insumos).
 * - `planes_logisticos`: un plan por evento, con su presupuesto, costo
 *   estimado y el estado BORRADOR → APROBADO.
 * - `plan_recursos` / `plan_proveedores` / `plan_personal`: lo que el plan
 *   asigna de cada catálogo (personal reutiliza `empleados`, ya existente).
 * - `cronograma_items`: el cronograma generado al aprobar (post-condición 1).
 * - `bitacora_planificacion`: auditoría del plan (trazabilidad).
 * - `solicitudes_personal_adicional`: CU-016A.
 */
export class Cu016Cu030Planificacion1794950000000 implements MigrationInterface {
  name = 'Cu016Cu030Planificacion1794950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "proveedores" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "nombre" character varying(200) NOT NULL,
      "tipo_servicio" character varying(30) NOT NULL,
      "nombre_contacto" character varying(200),
      "telefono" character varying(40),
      "correo" character varying(200),
      "direccion" character varying(300),
      "costo_referencia" numeric(12,2),
      "estado" character varying(10) NOT NULL DEFAULT 'ACTIVO',
      "creado_por" uuid NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_proveedores" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_proveedores_tipo" CHECK ("tipo_servicio" IN ('CATERING', 'SONIDO', 'SEGURIDAD', 'ILUMINACION', 'TRANSPORTE', 'LIMPIEZA', 'OTRO')),
      CONSTRAINT "CHK_proveedores_estado" CHECK ("estado" IN ('ACTIVO', 'INACTIVO')),
      CONSTRAINT "CHK_proveedores_costo" CHECK ("costo_referencia" IS NULL OR "costo_referencia" >= 0)
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_proveedores_tipo_estado" ON "proveedores" ("tipo_servicio", "estado")`);

    await queryRunner.query(`CREATE TABLE "documentos_proveedor" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "proveedor_id" uuid NOT NULL,
      "nombre" character varying(200) NOT NULL,
      "tipo" character varying(40) NOT NULL,
      "contenido" bytea NOT NULL,
      "tamano" integer NOT NULL,
      "subido_por" uuid NOT NULL,
      "subido_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_documentos_proveedor" PRIMARY KEY ("id"),
      CONSTRAINT "FK_documentos_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_documentos_proveedor" ON "documentos_proveedor" ("proveedor_id")`);

    await queryRunner.query(`CREATE TABLE "recursos_logisticos" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "nombre" character varying(200) NOT NULL,
      "tipo" character varying(30) NOT NULL,
      "cantidad_total" integer NOT NULL,
      "costo_unitario" numeric(12,2) NOT NULL DEFAULT 0,
      "creado_por" uuid NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_recursos_logisticos" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_recursos_tipo" CHECK ("tipo" IN ('EQUIPO_SONIDO', 'ILUMINACION', 'ESCENARIO', 'GENERADOR', 'MOBILIARIO', 'CARPAS', 'OTRO')),
      CONSTRAINT "CHK_recursos_cantidad" CHECK ("cantidad_total" > 0),
      CONSTRAINT "CHK_recursos_costo" CHECK ("costo_unitario" >= 0),
      CONSTRAINT "UQ_recursos_nombre" UNIQUE ("nombre")
    )`);

    await queryRunner.query(`CREATE TABLE "planes_logisticos" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "evento_id" uuid NOT NULL,
      "estado" character varying(10) NOT NULL DEFAULT 'BORRADOR',
      "presupuesto" numeric(12,2),
      "costo_estimado" numeric(12,2) NOT NULL DEFAULT 0,
      "fecha_evento_cronograma" TIMESTAMP WITH TIME ZONE,
      "creado_por" uuid NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "aprobado_por" uuid,
      "aprobado_en" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "PK_planes_logisticos" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_planes_evento" UNIQUE ("evento_id"),
      CONSTRAINT "CHK_planes_estado" CHECK ("estado" IN ('BORRADOR', 'APROBADO')),
      CONSTRAINT "CHK_planes_presupuesto" CHECK ("presupuesto" IS NULL OR "presupuesto" >= 0)
    )`);

    await queryRunner.query(`CREATE TABLE "plan_recursos" (
      "plan_id" uuid NOT NULL,
      "recurso_id" uuid NOT NULL,
      "cantidad" integer NOT NULL,
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_plan_recursos" PRIMARY KEY ("plan_id", "recurso_id"),
      CONSTRAINT "FK_plan_recursos_plan" FOREIGN KEY ("plan_id") REFERENCES "planes_logisticos"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_plan_recursos_recurso" FOREIGN KEY ("recurso_id") REFERENCES "recursos_logisticos"("id"),
      CONSTRAINT "CHK_plan_recursos_cantidad" CHECK ("cantidad" > 0)
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_plan_recursos_recurso" ON "plan_recursos" ("recurso_id")`);

    await queryRunner.query(`CREATE TABLE "plan_proveedores" (
      "plan_id" uuid NOT NULL,
      "proveedor_id" uuid NOT NULL,
      "costo" numeric(12,2),
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_plan_proveedores" PRIMARY KEY ("plan_id", "proveedor_id"),
      CONSTRAINT "FK_plan_proveedores_plan" FOREIGN KEY ("plan_id") REFERENCES "planes_logisticos"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_plan_proveedores_proveedor" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id"),
      CONSTRAINT "CHK_plan_proveedores_costo" CHECK ("costo" IS NULL OR "costo" >= 0)
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_plan_proveedores_proveedor" ON "plan_proveedores" ("proveedor_id")`);

    await queryRunner.query(`CREATE TABLE "plan_personal" (
      "plan_id" uuid NOT NULL,
      "empleado_id" uuid NOT NULL,
      "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_plan_personal" PRIMARY KEY ("plan_id", "empleado_id"),
      CONSTRAINT "FK_plan_personal_plan" FOREIGN KEY ("plan_id") REFERENCES "planes_logisticos"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_plan_personal_empleado" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_plan_personal_empleado" ON "plan_personal" ("empleado_id")`);

    await queryRunner.query(`CREATE TABLE "cronograma_items" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "plan_id" uuid NOT NULL,
      "titulo" character varying(200) NOT NULL,
      "inicio" TIMESTAMP WITH TIME ZONE NOT NULL,
      "fin" TIMESTAMP WITH TIME ZONE NOT NULL,
      "tipo" character varying(20) NOT NULL,
      CONSTRAINT "PK_cronograma_items" PRIMARY KEY ("id"),
      CONSTRAINT "FK_cronograma_items" FOREIGN KEY ("plan_id") REFERENCES "planes_logisticos"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_cronograma_tipo" CHECK ("tipo" IN ('MONTAJE', 'EVENTO', 'DESMONTAJE'))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_cronograma_items_plan" ON "cronograma_items" ("plan_id", "inicio")`);

    await queryRunner.query(`CREATE TABLE "bitacora_planificacion" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "plan_id" uuid NOT NULL,
      "tipo" character varying(30) NOT NULL,
      "detalle" jsonb NOT NULL DEFAULT '{}',
      "realizado_por" uuid,
      "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT "PK_bitacora_planificacion" PRIMARY KEY ("id"),
      CONSTRAINT "FK_bitacora_planificacion" FOREIGN KEY ("plan_id") REFERENCES "planes_logisticos"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_bitacora_planificacion" ON "bitacora_planificacion" ("plan_id", "fecha")`);

    await queryRunner.query(`CREATE TABLE "solicitudes_personal_adicional" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "plan_id" uuid NOT NULL,
      "rol" character varying(120) NOT NULL,
      "cantidad" integer NOT NULL,
      "motivo" text NOT NULL,
      "estado" character varying(12) NOT NULL DEFAULT 'PENDIENTE',
      "creado_por" uuid NOT NULL,
      "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_solicitudes_personal_adicional" PRIMARY KEY ("id"),
      CONSTRAINT "FK_solicitudes_personal_adicional" FOREIGN KEY ("plan_id") REFERENCES "planes_logisticos"("id") ON DELETE CASCADE,
      CONSTRAINT "CHK_solicitudes_cantidad" CHECK ("cantidad" > 0),
      CONSTRAINT "CHK_solicitudes_estado" CHECK ("estado" IN ('PENDIENTE', 'ATENDIDA'))
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_solicitudes_personal_adicional" ON "solicitudes_personal_adicional" ("plan_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "solicitudes_personal_adicional"`);
    await queryRunner.query(`DROP TABLE "bitacora_planificacion"`);
    await queryRunner.query(`DROP TABLE "cronograma_items"`);
    await queryRunner.query(`DROP TABLE "plan_personal"`);
    await queryRunner.query(`DROP TABLE "plan_proveedores"`);
    await queryRunner.query(`DROP TABLE "plan_recursos"`);
    await queryRunner.query(`DROP TABLE "planes_logisticos"`);
    await queryRunner.query(`DROP TABLE "recursos_logisticos"`);
    await queryRunner.query(`DROP TABLE "documentos_proveedor"`);
    await queryRunner.query(`DROP TABLE "proveedores"`);
  }
}
