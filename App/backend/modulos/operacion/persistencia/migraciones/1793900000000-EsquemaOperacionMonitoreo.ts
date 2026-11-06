import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-019 (Monitorear el evento). Esquema `operacion`, del módulo que ADR-16
 * reserva para el programa Operación (CU-010/019/020); mientras ese proceso no
 * existe, corre dentro del Núcleo.
 *
 * - `ingresos`: copia de los ingresos que publica Acceso QR
 *   (`acceso.eventos` / `ingreso.registrado`). La clave es el id del ingreso:
 *   un mensaje repetido no cuenta dos veces.
 * - `puntos_acceso`: estado de cada entrada según las decisiones del supervisor.
 * - `alertas`: una fila por situación; mientras sigue activa no se duplica.
 * - `decisiones`: historial de lo que decidió el supervisor y su resultado.
 */
export class EsquemaOperacionMonitoreo1793900000000 implements MigrationInterface {
  name = 'EsquemaOperacionMonitoreo1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "ingresos" ("id" uuid NOT NULL, "evento_id" uuid NOT NULL, "punto_acceso" character varying(120) NOT NULL, "escaneado_en" TIMESTAMP WITH TIME ZONE NOT NULL, "recibido_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ingresos" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_ingresos_evento_tiempo" ON "ingresos" ("evento_id", "escaneado_en")`);

    await queryRunner.query(`CREATE TYPE "punto_acceso_estado" AS ENUM('HABILITADO', 'CERRADO')`);
    await queryRunner.query(`CREATE TABLE "puntos_acceso" ("evento_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "estado" "punto_acceso_estado" NOT NULL DEFAULT 'HABILITADO', "alternativa" character varying(120), "actualizado_por" uuid, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_puntos_acceso" PRIMARY KEY ("evento_id", "nombre"))`);

    await queryRunner.query(`CREATE TABLE "alertas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "tipo" character varying(40) NOT NULL, "clave" character varying(200) NOT NULL, "severidad" character varying(10) NOT NULL, "mensaje" text NOT NULL, "sugerencia" jsonb, "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resuelta_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_alertas" PRIMARY KEY ("id"), CONSTRAINT "CHK_alertas_severidad" CHECK ("severidad" IN ('info', 'aviso', 'critica')))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_alertas_activa" ON "alertas" ("evento_id", "clave") WHERE "resuelta_en" IS NULL`);

    await queryRunner.query(`CREATE TABLE "decisiones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "tipo" character varying(40) NOT NULL, "descripcion" text NOT NULL, "zona" character varying(120), "punto_acceso" character varying(120), "alternativa" character varying(120), "alerta_id" uuid, "resultado" text, "realizado_por" uuid NOT NULL, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "resultado_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_decisiones" PRIMARY KEY ("id"), CONSTRAINT "FK_decisiones_alerta" FOREIGN KEY ("alerta_id") REFERENCES "alertas"("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_decisiones_evento" ON "decisiones" ("evento_id", "fecha")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "decisiones"`);
    await queryRunner.query(`DROP TABLE "alertas"`);
    await queryRunner.query(`DROP TABLE "puntos_acceso"`);
    await queryRunner.query(`DROP TYPE "punto_acceso_estado"`);
    await queryRunner.query(`DROP TABLE "ingresos"`);
  }
}
