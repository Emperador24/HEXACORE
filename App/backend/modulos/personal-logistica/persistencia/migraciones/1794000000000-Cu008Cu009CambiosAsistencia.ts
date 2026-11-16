import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-008 (Gestionar cambios de turno) y CU-009 (Registrar ingreso y salida).
 *
 * Solicitudes de cambio:
 * - `CANCELADA` (CU-008B): el empleado retira su solicitud antes de que la
 *   revisen.
 * - `empleadoSolicitanteId`: quién pidió el cambio. Al aprobar, el turno pasa
 *   al reemplazo y deja de decirlo; hace falta para devolvérselo si el
 *   reemplazo rechaza (CU-008C). Nulo en las solicitudes anteriores.
 * - `respuestaReemplazo` (PENDIENTE, ACEPTADA, RECHAZADA): lo que contestó el
 *   reemplazo a su nueva asignación (pasos 12 y CU-008C).
 * - `reemplazosDescartados`: quienes ya rechazaron cubrir ese turno, para no
 *   volver a proponerlos.
 *
 * Asistencia:
 * - `puntualidad` y `minutosDesviacion` (CU-009A/B/C): si la entrada fue
 *   anticipada, a tiempo o tardía, y la salida anticipada, a tiempo o
 *   posterior, con los minutos de diferencia respecto al horario del turno.
 *
 * `ADD VALUE` no se puede usar en la misma transacción que lo crea; esta
 * migración no lo usa.
 */
export class Cu008Cu009CambiosAsistencia1794000000000 implements MigrationInterface {
  name = 'Cu008Cu009CambiosAsistencia1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."solicitudes_cambio_turno_estado_enum" ADD VALUE IF NOT EXISTS 'CANCELADA'`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" ADD "empleadoSolicitanteId" uuid`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" ADD "respuestaReemplazo" character varying(10)`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" ADD "reemplazosDescartados" uuid array NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" ADD CONSTRAINT "CHK_solicitudes_respuesta_reemplazo" CHECK ("respuestaReemplazo" IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA'))`);
    // Las pendientes todavía tienen el turno a nombre de quien lo pidió.
    await queryRunner.query(
      `UPDATE "solicitudes_cambio_turno" s SET "empleadoSolicitanteId" = t."empleadoId"::uuid
         FROM "turnos" t WHERE t."id"::text = s."turnoId"::text AND s."estado" IN ('PENDIENTE', 'SIN_REEMPLAZO')`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_solicitudes_cambio_turno" ON "solicitudes_cambio_turno" ("turnoId", "estado")`);

    await queryRunner.query(`ALTER TABLE "registros_asistencia" ADD "puntualidad" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" ADD "minutosDesviacion" integer`);
    await queryRunner.query(`CREATE INDEX "IDX_registros_asistencia_empleado_turno" ON "registros_asistencia" ("empleadoId", "turnoId", "timestamp")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_registros_asistencia_empleado_turno"`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" DROP COLUMN "minutosDesviacion"`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" DROP COLUMN "puntualidad"`);
    await queryRunner.query(`DROP INDEX "IDX_solicitudes_cambio_turno"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" DROP CONSTRAINT "CHK_solicitudes_respuesta_reemplazo"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" DROP COLUMN "reemplazosDescartados"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" DROP COLUMN "respuestaReemplazo"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" DROP COLUMN "empleadoSolicitanteId"`);
    // Postgres no quita valores de un ENUM: las canceladas vuelven a rechazadas y el valor queda.
    await queryRunner.query(`UPDATE "solicitudes_cambio_turno" SET "estado" = 'RECHAZADA' WHERE "estado" = 'CANCELADA'`);
  }
}
