import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-024 (Cobro) y CU-025 (Control de ocupación). Esquema `parqueaderos`,
 * undécimo de la base única; sin procedencia histórica (el servicio anterior
 * nunca pasó de su README).
 *
 * - `zonas_parqueadero`: zonas de un evento con su capacidad. `evento_id`
 *   referencia a eventos-recintos sin FK entre esquemas.
 * - `tarifas`: la tarifa por hora, centralizada y con historial: la vigente es
 *   la última cuyo `vigente_desde` ya pasó. El cobro guarda la que aplicó.
 * - `estancias`: cada vehículo desde que entra hasta que sale, con lo cobrado.
 *   Un vehículo no puede estar dos veces en el lote del mismo evento.
 * - `redirecciones`: decisiones del supervisor de mandar los ingresos a otra
 *   zona (CU-025, pasos 6-8) y su resultado.
 *
 * La reserva (CU-021) y la lectura de su QR (CU-022/023) no están aquí: son
 * de otro responsable. `reserva_id` y `prepagada` son lo que llega de ellas.
 */
export class EsquemaParqueaderos1794200000000 implements MigrationInterface {
  name = 'EsquemaParqueaderos1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "zonas_parqueadero" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "capacidad" integer NOT NULL, "orden" integer NOT NULL DEFAULT 0, "creada_por" uuid NOT NULL, "creada_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_zonas_parqueadero" PRIMARY KEY ("id"), CONSTRAINT "CHK_zonas_parqueadero_capacidad" CHECK ("capacidad" > 0))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_zonas_parqueadero_nombre" ON "zonas_parqueadero" ("evento_id", lower("nombre"))`);

    await queryRunner.query(`CREATE TABLE "tarifas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "valor_hora" numeric(12,2) NOT NULL, "vigente_desde" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "definida_por" uuid NOT NULL, "motivo" text, CONSTRAINT "PK_tarifas" PRIMARY KEY ("id"), CONSTRAINT "CHK_tarifas_valor" CHECK ("valor_hora" > 0))`);
    await queryRunner.query(`CREATE INDEX "IDX_tarifas_vigencia" ON "tarifas" ("vigente_desde")`);

    await queryRunner.query(`CREATE TABLE "estancias" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "zona_id" uuid NOT NULL, "placa" character varying(10) NOT NULL, "espacio" character varying(20), "reserva_id" uuid, "prepagada" boolean NOT NULL DEFAULT false, "ingreso_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ingreso_por" uuid NOT NULL, "salida_en" TIMESTAMP WITH TIME ZONE, "salida_por" uuid, "tarifa_id" uuid, "valor_hora" numeric(12,2), "horas_cobradas" integer, "monto" numeric(12,2), CONSTRAINT "PK_estancias" PRIMARY KEY ("id"), CONSTRAINT "FK_estancias_zona" FOREIGN KEY ("zona_id") REFERENCES "zonas_parqueadero"("id"), CONSTRAINT "FK_estancias_tarifa" FOREIGN KEY ("tarifa_id") REFERENCES "tarifas"("id"), CONSTRAINT "CHK_estancias_salida" CHECK ("salida_en" IS NULL OR "salida_en" >= "ingreso_en"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_estancias_placa_en_lote" ON "estancias" ("evento_id", "placa") WHERE "salida_en" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_estancias_zona_en_lote" ON "estancias" ("zona_id") WHERE "salida_en" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_estancias_evento_tiempos" ON "estancias" ("evento_id", "ingreso_en", "salida_en")`);

    await queryRunner.query(`CREATE TABLE "redirecciones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "zona_origen_id" uuid, "zona_destino_id" uuid NOT NULL, "motivo" text NOT NULL, "vigente" boolean NOT NULL DEFAULT true, "resultado" text, "realizado_por" uuid NOT NULL, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "terminada_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_redirecciones" PRIMARY KEY ("id"), CONSTRAINT "FK_redirecciones_origen" FOREIGN KEY ("zona_origen_id") REFERENCES "zonas_parqueadero"("id"), CONSTRAINT "FK_redirecciones_destino" FOREIGN KEY ("zona_destino_id") REFERENCES "zonas_parqueadero"("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_redirecciones_vigente" ON "redirecciones" ("evento_id") WHERE "vigente"`);
    await queryRunner.query(`CREATE INDEX "IDX_redirecciones_evento" ON "redirecciones" ("evento_id", "fecha")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "redirecciones"`);
    await queryRunner.query(`DROP TABLE "estancias"`);
    await queryRunner.query(`DROP TABLE "tarifas"`);
    await queryRunner.query(`DROP TABLE "zonas_parqueadero"`);
  }
}
