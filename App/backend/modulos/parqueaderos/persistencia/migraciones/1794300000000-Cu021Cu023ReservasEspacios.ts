import { MigrationInterface, QueryRunner } from 'typeorm';

/** Estados de una reserva que retienen su espacio. */
const RESERVA_ACTIVA = `'PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA'`;

/** `A-01` … `A-09`, `A-10` … `A-150`: el prefijo de la zona y el número del espacio. */
const CODIGO = (prefijo: string, numero: string) => `${prefijo} || '-' || CASE WHEN ${numero} < 10 THEN '0' || ${numero} ELSE ${numero}::text END`;

/**
 * CU-021 (Reservar), CU-022 (Ingreso y salida) y CU-023 (Asignación de
 * espacios) sobre el esquema `parqueaderos`.
 *
 * - `espacios`: cada lugar físico de una zona, con su tipo (automóvil, moto,
 *   movilidad reducida) y su prioridad (cercanía a la entrada). La capacidad
 *   de la zona pasa a ser cuántos espacios activos tiene; las zonas que ya
 *   existían reciben sus espacios aquí.
 * - `reservas`: la reserva del cliente con su espacio retenido, el pago y el
 *   QR. Dos índices únicos parciales impiden la doble reserva de un espacio y
 *   de una placa (Consistencia de CU-021).
 * - `estancias` gana el espacio asignado (único mientras el vehículo esté
 *   dentro: CU-023B) y los identificadores locales del punto de control, que
 *   hacen idempotente la sincronización de lo registrado sin red (CU-022).
 * - `asignaciones_espacio`: historial de ocupación por zona (CU-023, paso 8).
 * - `notificaciones_reserva`: bandeja de salida de la confirmación por correo
 *   (CU-021, paso 9).
 */
export class Cu021Cu023ReservasEspacios1794300000000 implements MigrationInterface {
  name = 'Cu021Cu023ReservasEspacios1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "zonas_parqueadero" ADD "prefijo" character varying(6)`);
    await queryRunner.query(
      `UPDATE "zonas_parqueadero" SET "prefijo" = coalesce(nullif(upper(left(regexp_replace(regexp_replace("nombre", '^\\s*zona\\s+', '', 'i'), '[^A-Za-z0-9]', '', 'g'), 1)), ''), 'Z')`);
    await queryRunner.query(`ALTER TABLE "zonas_parqueadero" ALTER COLUMN "prefijo" SET NOT NULL`);

    await queryRunner.query(`CREATE TABLE "espacios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "zona_id" uuid NOT NULL, "numero" integer NOT NULL, "codigo" character varying(20) NOT NULL, "tipo" character varying(20) NOT NULL DEFAULT 'AUTOMOVIL', "prioridad" integer NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_espacios" PRIMARY KEY ("id"), CONSTRAINT "FK_espacios_zona" FOREIGN KEY ("zona_id") REFERENCES "zonas_parqueadero"("id") ON DELETE CASCADE, CONSTRAINT "UQ_espacios_numero" UNIQUE ("zona_id", "numero"), CONSTRAINT "CHK_espacios_tipo" CHECK ("tipo" IN ('AUTOMOVIL', 'MOTO', 'DISCAPACIDAD')))`);
    await queryRunner.query(`CREATE INDEX "IDX_espacios_asignacion" ON "espacios" ("zona_id", "prioridad", "numero") WHERE "activo"`);
    await queryRunner.query(
      `INSERT INTO "espacios" ("zona_id", "numero", "codigo", "prioridad")
       SELECT z.id, n, ${CODIGO('z.prefijo', 'n')}, n FROM "zonas_parqueadero" z, generate_series(1, z.capacidad) n`);

    await queryRunner.query(`CREATE TABLE "reservas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "zona_id" uuid NOT NULL, "espacio_id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "placa" character varying(10) NOT NULL, "tipo_vehiculo" character varying(20) NOT NULL, "llegada_estimada" TIMESTAMP WITH TIME ZONE NOT NULL, "estado" character varying(20) NOT NULL DEFAULT 'PENDIENTE_PAGO', "tarifa_id" uuid NOT NULL, "valor_hora" numeric(12,2) NOT NULL, "horas" integer NOT NULL, "monto" numeric(12,2) NOT NULL, "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL, "intentos_rechazados" integer NOT NULL DEFAULT 0, "motivo" text, "referencia_pago" text, "codigo_qr" character varying(40), "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "confirmada_en" TIMESTAMP WITH TIME ZONE, "usada_en" TIMESTAMP WITH TIME ZONE, "estancia_id" uuid, CONSTRAINT "PK_reservas" PRIMARY KEY ("id"), CONSTRAINT "FK_reservas_zona" FOREIGN KEY ("zona_id") REFERENCES "zonas_parqueadero"("id"), CONSTRAINT "FK_reservas_espacio" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id"), CONSTRAINT "FK_reservas_tarifa" FOREIGN KEY ("tarifa_id") REFERENCES "tarifas"("id"), CONSTRAINT "FK_reservas_estancia" FOREIGN KEY ("estancia_id") REFERENCES "estancias"("id"), CONSTRAINT "UQ_reservas_codigo_qr" UNIQUE ("codigo_qr"), CONSTRAINT "CHK_reservas_estado" CHECK ("estado" IN ('PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA', 'USADA', 'EXPIRADA')), CONSTRAINT "CHK_reservas_tipo" CHECK ("tipo_vehiculo" IN ('AUTOMOVIL', 'MOTO', 'DISCAPACIDAD')), CONSTRAINT "CHK_reservas_qr" CHECK ("estado" NOT IN ('CONFIRMADA', 'USADA') OR "codigo_qr" IS NOT NULL))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reservas_espacio_activa" ON "reservas" ("espacio_id") WHERE "estado" IN (${RESERVA_ACTIVA})`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reservas_placa_activa" ON "reservas" ("evento_id", "placa") WHERE "estado" IN (${RESERVA_ACTIVA})`);
    await queryRunner.query(`CREATE INDEX "IDX_reservas_zona_activa" ON "reservas" ("zona_id") WHERE "estado" IN (${RESERVA_ACTIVA})`);
    await queryRunner.query(`CREATE INDEX "IDX_reservas_cliente" ON "reservas" ("cliente_id", "creada_en")`);
    await queryRunner.query(`CREATE INDEX "IDX_reservas_por_vencer" ON "reservas" ("expira_en") WHERE "estado" = 'PENDIENTE_PAGO'`);

    await queryRunner.query(`ALTER TABLE "estancias" ADD "espacio_id" uuid`);
    await queryRunner.query(`ALTER TABLE "estancias" ADD "tipo_vehiculo" character varying(20) NOT NULL DEFAULT 'AUTOMOVIL'`);
    await queryRunner.query(`ALTER TABLE "estancias" ADD "registro_local_id" uuid`);
    await queryRunner.query(`ALTER TABLE "estancias" ADD "salida_local_id" uuid`);
    await queryRunner.query(`ALTER TABLE "estancias" ADD CONSTRAINT "FK_estancias_espacio" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id")`);
    await queryRunner.query(`ALTER TABLE "estancias" ADD CONSTRAINT "UQ_estancias_registro_local" UNIQUE ("registro_local_id")`);
    await queryRunner.query(`ALTER TABLE "estancias" ADD CONSTRAINT "UQ_estancias_salida_local" UNIQUE ("salida_local_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_estancias_espacio_en_lote" ON "estancias" ("espacio_id") WHERE "salida_en" IS NULL AND "espacio_id" IS NOT NULL`);

    await queryRunner.query(`CREATE TABLE "asignaciones_espacio" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "zona_id" uuid NOT NULL, "espacio_id" uuid NOT NULL, "origen" character varying(20) NOT NULL, "placa" character varying(10) NOT NULL, "tipo_vehiculo" character varying(20) NOT NULL, "reserva_id" uuid, "estancia_id" uuid, "detalle" text, "realizado_por" uuid NOT NULL, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_asignaciones_espacio" PRIMARY KEY ("id"), CONSTRAINT "FK_asignaciones_zona" FOREIGN KEY ("zona_id") REFERENCES "zonas_parqueadero"("id"), CONSTRAINT "FK_asignaciones_espacio" FOREIGN KEY ("espacio_id") REFERENCES "espacios"("id"), CONSTRAINT "CHK_asignaciones_origen" CHECK ("origen" IN ('RESERVA', 'INGRESO', 'REASIGNACION', 'LIBERACION')))`);
    await queryRunner.query(`CREATE INDEX "IDX_asignaciones_evento" ON "asignaciones_espacio" ("evento_id", "fecha")`);

    await queryRunner.query(`CREATE TABLE "notificaciones_reserva" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "reserva_id" uuid NOT NULL, "cliente_id" uuid NOT NULL, "mensaje" text NOT NULL, "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "publicada_en" TIMESTAMP WITH TIME ZONE, "entregada_en" TIMESTAMP WITH TIME ZONE, "intentos" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_notificaciones_reserva" PRIMARY KEY ("id"), CONSTRAINT "FK_notificaciones_reserva" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id"), CONSTRAINT "UQ_notificaciones_reserva" UNIQUE ("reserva_id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_notificaciones_reserva_pendientes" ON "notificaciones_reserva" ("creada_en") WHERE "publicada_en" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notificaciones_reserva"`);
    await queryRunner.query(`DROP TABLE "asignaciones_espacio"`);
    await queryRunner.query(`DROP INDEX "UQ_estancias_espacio_en_lote"`);
    await queryRunner.query(`ALTER TABLE "estancias" DROP CONSTRAINT "UQ_estancias_salida_local"`);
    await queryRunner.query(`ALTER TABLE "estancias" DROP CONSTRAINT "UQ_estancias_registro_local"`);
    await queryRunner.query(`ALTER TABLE "estancias" DROP CONSTRAINT "FK_estancias_espacio"`);
    await queryRunner.query(`ALTER TABLE "estancias" DROP COLUMN "salida_local_id", DROP COLUMN "registro_local_id", DROP COLUMN "tipo_vehiculo", DROP COLUMN "espacio_id"`);
    await queryRunner.query(`DROP TABLE "reservas"`);
    await queryRunner.query(`DROP TABLE "espacios"`);
    await queryRunner.query(`ALTER TABLE "zonas_parqueadero" DROP COLUMN "prefijo"`);
  }
}
