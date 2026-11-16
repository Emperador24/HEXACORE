import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-007 (Gestión de personal para eventos).
 *
 * - Ficha del empleado: documento, correo y teléfono. Documento y correo son
 *   únicos (paso 4: sin duplicados). Quedan nulos en las fichas creadas antes
 *   de este caso de uso; Postgres admite varios NULL bajo UNIQUE.
 * - Respuesta del empleado a la asignación (paso 13 y CU-007B). Los turnos que
 *   ya existían se marcan CONFIRMADA: se crearon cuando no había que
 *   confirmarlos, y dejarlos pendientes cambiaría su significado.
 * - Auditoría de altas, ediciones, desactivaciones y asignaciones.
 * - Índice para buscar choques de horario de un empleado sin recorrer la tabla.
 */
export class Cu007GestionPersonal1793664000000 implements MigrationInterface {
  name = 'Cu007GestionPersonal1793664000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empleados" ADD "documento" character varying`);
    await queryRunner.query(`ALTER TABLE "empleados" ADD "correo" character varying`);
    await queryRunner.query(`ALTER TABLE "empleados" ADD "telefono" character varying`);
    await queryRunner.query(`ALTER TABLE "empleados" ADD CONSTRAINT "UQ_empleados_documento" UNIQUE ("documento")`);
    await queryRunner.query(`ALTER TABLE "empleados" ADD CONSTRAINT "UQ_empleados_correo" UNIQUE ("correo")`);

    await queryRunner.query(`CREATE TYPE "turnos_confirmacion_enum" AS ENUM('PENDIENTE', 'CONFIRMADA', 'RECHAZADA')`);
    await queryRunner.query(`ALTER TABLE "turnos" ADD "confirmacion" "turnos_confirmacion_enum" NOT NULL DEFAULT 'CONFIRMADA'`);
    await queryRunner.query(`ALTER TABLE "turnos" ALTER COLUMN "confirmacion" SET DEFAULT 'PENDIENTE'`);
    await queryRunner.query(`ALTER TABLE "turnos" ADD "motivoRechazo" character varying`);
    await queryRunner.query(`ALTER TABLE "turnos" ADD "respondidoEn" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`CREATE INDEX "IDX_turnos_empleado_horario" ON "turnos" ("empleadoId", "horaInicio", "horaFin")`);

    await queryRunner.query(
      `CREATE TABLE "auditoria_personal" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "accion" character varying NOT NULL, "empleadoId" uuid, "turnoId" uuid, "realizadoPor" uuid NOT NULL, "detalle" jsonb NOT NULL DEFAULT '{}', "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_auditoria_personal_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_auditoria_personal_empleado" ON "auditoria_personal" ("empleadoId", "fecha")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_auditoria_personal_empleado"`);
    await queryRunner.query(`DROP TABLE "auditoria_personal"`);
    await queryRunner.query(`DROP INDEX "IDX_turnos_empleado_horario"`);
    await queryRunner.query(`ALTER TABLE "turnos" DROP COLUMN "respondidoEn"`);
    await queryRunner.query(`ALTER TABLE "turnos" DROP COLUMN "motivoRechazo"`);
    await queryRunner.query(`ALTER TABLE "turnos" DROP COLUMN "confirmacion"`);
    await queryRunner.query(`DROP TYPE "turnos_confirmacion_enum"`);
    await queryRunner.query(`ALTER TABLE "empleados" DROP CONSTRAINT "UQ_empleados_correo"`);
    await queryRunner.query(`ALTER TABLE "empleados" DROP CONSTRAINT "UQ_empleados_documento"`);
    await queryRunner.query(`ALTER TABLE "empleados" DROP COLUMN "telefono"`);
    await queryRunner.query(`ALTER TABLE "empleados" DROP COLUMN "correo"`);
    await queryRunner.query(`ALTER TABLE "empleados" DROP COLUMN "documento"`);
  }
}
