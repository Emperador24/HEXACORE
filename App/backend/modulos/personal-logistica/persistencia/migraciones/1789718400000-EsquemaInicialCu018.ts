import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial de CU-018 (Gestionar turno y asistencia del personal).
 * Generada con `migration:generate` contra una base vacía y editada a mano:
 * `uuid_generate_v4()` (requiere la extensión uuid-ossp) reemplazado por
 * `gen_random_uuid()`, integrado en Postgres 13+, mismo patrón que usa
 * Administración.
 */
export class EsquemaInicialCu0181789718400000 implements MigrationInterface {
  name = 'EsquemaInicialCu0181789718400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."turnos_estado_enum" AS ENUM('ASIGNADO', 'CAMBIO_SOLICITADO', 'CAMBIADO', 'CANCELADO')`);
    await queryRunner.query(`CREATE TABLE "turnos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "empleadoId" uuid NOT NULL, "eventoId" character varying NOT NULL, "zona" character varying NOT NULL, "horaInicio" TIMESTAMP WITH TIME ZONE NOT NULL, "horaFin" TIMESTAMP WITH TIME ZONE NOT NULL, "estado" "public"."turnos_estado_enum" NOT NULL DEFAULT 'ASIGNADO', CONSTRAINT "PK_61dbaea0fc136ee2ef981f14782" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "empleados" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "usuarioId" uuid NOT NULL, "nombre" character varying NOT NULL, "rol" character varying NOT NULL, "credencial" character varying NOT NULL, "activo" boolean NOT NULL DEFAULT true, "horasTrabajadasTotales" double precision NOT NULL DEFAULT '0', CONSTRAINT "UQ_149783bdb3291033ccd3ef9ee39" UNIQUE ("usuarioId"), CONSTRAINT "UQ_d895bb4248c3f09e87f99f4a4f9" UNIQUE ("credencial"), CONSTRAINT "PK_73a63a6fcb4266219be3eb0ce8a" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "notificaciones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tipo" character varying NOT NULL, "turnoId" character varying NOT NULL, "empleadoId" character varying NOT NULL, "mensaje" character varying NOT NULL, "latenciaMs" double precision NOT NULL, "recibidoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a9d32a419ff58b53a38b5ef85d4" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."registros_asistencia_tipo_enum" AS ENUM('ENTRADA', 'SALIDA')`);
    await queryRunner.query(`CREATE TABLE "registros_asistencia" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "empleadoId" uuid NOT NULL, "turnoId" uuid, "tipo" "public"."registros_asistencia_tipo_enum" NOT NULL, "credencialUsada" character varying NOT NULL, "anomalia" boolean NOT NULL DEFAULT false, "motivoAnomalia" character varying, "horasCalculadas" double precision, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL, "idempotencyKey" character varying, "sincronizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_859a5354105c601691073964a20" UNIQUE ("idempotencyKey"), CONSTRAINT "PK_36b13209a79c9e8898f70bcd5e6" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."solicitudes_cambio_turno_estado_enum" AS ENUM('PENDIENTE', 'SIN_REEMPLAZO', 'APROBADA', 'RECHAZADA', 'BLOQUEADA_POR_HORAS')`);
    await queryRunner.query(`CREATE TABLE "solicitudes_cambio_turno" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "turnoId" uuid NOT NULL, "motivo" character varying NOT NULL, "empleadoReemplazoId" uuid, "estado" "public"."solicitudes_cambio_turno_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "revisadoPorId" character varying, "motivoRechazoOBloqueo" character varying, "fechaSolicitud" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fechaRevision" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5c40f0257b0ef8e3eb9674c0d99" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "turnos" ADD CONSTRAINT "FK_24a00e0a11e8b29c0e4cde602f9" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" ADD CONSTRAINT "FK_6ad00b1b983aca3e96d1f6a363d" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" ADD CONSTRAINT "FK_e97bdf07f2a4cd7f656fd38f1fb" FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" ADD CONSTRAINT "FK_c60738ca5893cf2f2319ac0ddfc" FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" ADD CONSTRAINT "FK_90265cb7c155bcd529c4d0593e4" FOREIGN KEY ("empleadoReemplazoId") REFERENCES "empleados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" DROP CONSTRAINT "FK_90265cb7c155bcd529c4d0593e4"`);
    await queryRunner.query(`ALTER TABLE "solicitudes_cambio_turno" DROP CONSTRAINT "FK_c60738ca5893cf2f2319ac0ddfc"`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" DROP CONSTRAINT "FK_e97bdf07f2a4cd7f656fd38f1fb"`);
    await queryRunner.query(`ALTER TABLE "registros_asistencia" DROP CONSTRAINT "FK_6ad00b1b983aca3e96d1f6a363d"`);
    await queryRunner.query(`ALTER TABLE "turnos" DROP CONSTRAINT "FK_24a00e0a11e8b29c0e4cde602f9"`);
    await queryRunner.query(`DROP TABLE "solicitudes_cambio_turno"`);
    await queryRunner.query(`DROP TYPE "public"."solicitudes_cambio_turno_estado_enum"`);
    await queryRunner.query(`DROP TABLE "registros_asistencia"`);
    await queryRunner.query(`DROP TYPE "public"."registros_asistencia_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "notificaciones"`);
    await queryRunner.query(`DROP TABLE "empleados"`);
    await queryRunner.query(`DROP TABLE "turnos"`);
    await queryRunner.query(`DROP TYPE "public"."turnos_estado_enum"`);
  }
}
