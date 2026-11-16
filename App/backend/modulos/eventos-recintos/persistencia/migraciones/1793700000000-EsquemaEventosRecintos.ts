import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CU-026 (Gestión de eventos) y la parte de CU-029 que necesita: recintos y
 * zonas con su capacidad. Es el primer dueño del Evento: hasta ahora solo
 * existían las copias de Boletería, llenadas por semillas.
 *
 * - Las capacidades y precios llevan CHECK; la suma por recinto y por zona, y
 *   el traslape de fechas en un mismo recinto, los valida el servicio con la
 *   fila del recinto bloqueada (sin extensiones nuevas como btree_gist).
 * - `historial_eventos` no tiene llave foránea a `eventos`: borrar un borrador
 *   no puede borrar su rastro.
 * - `eventos_salientes` es la bandeja de salida (mismo patrón que Ventas).
 */
export class EsquemaEventosRecintos1793700000000 implements MigrationInterface {
  name = 'EsquemaEventosRecintos1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "recintos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(200) NOT NULL, "ciudad" character varying(120) NOT NULL, "direccion" character varying(200), "capacidad" integer NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_recintos" PRIMARY KEY ("id"), CONSTRAINT "UQ_recintos_nombre_ciudad" UNIQUE ("nombre", "ciudad"), CONSTRAINT "CHK_recintos_capacidad" CHECK ("capacidad" > 0))`);
    await queryRunner.query(`CREATE TABLE "zonas_recinto" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recinto_id" uuid NOT NULL, "nombre" character varying(120) NOT NULL, "capacidad" integer NOT NULL, CONSTRAINT "PK_zonas_recinto" PRIMARY KEY ("id"), CONSTRAINT "UQ_zonas_recinto_nombre" UNIQUE ("recinto_id", "nombre"), CONSTRAINT "CHK_zonas_recinto_capacidad" CHECK ("capacidad" > 0), CONSTRAINT "FK_zonas_recinto_recinto" FOREIGN KEY ("recinto_id") REFERENCES "recintos"("id") ON DELETE CASCADE)`);

    await queryRunner.query(`CREATE TYPE "evento_estado" AS ENUM('BORRADOR', 'PUBLICADO', 'CANCELADO')`);
    await queryRunner.query(`CREATE TABLE "eventos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "nombre" character varying(200) NOT NULL, "descripcion" text, "categoria" character varying(60) NOT NULL, "artista" character varying(200), "imagen_url" character varying(500), "recinto_id" uuid NOT NULL, "fecha_inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "fecha_fin" TIMESTAMP WITH TIME ZONE NOT NULL, "aforo_maximo" integer NOT NULL, "permite_reventa" boolean NOT NULL DEFAULT true, "estado" "evento_estado" NOT NULL DEFAULT 'BORRADOR', "version" integer NOT NULL DEFAULT 1, "creado_por" uuid NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "publicado_en" TIMESTAMP WITH TIME ZONE, "cancelado_en" TIMESTAMP WITH TIME ZONE, "motivo_cancelacion" text, CONSTRAINT "PK_eventos" PRIMARY KEY ("id"), CONSTRAINT "CHK_eventos_horario" CHECK ("fecha_fin" > "fecha_inicio"), CONSTRAINT "CHK_eventos_aforo" CHECK ("aforo_maximo" > 0), CONSTRAINT "FK_eventos_recinto" FOREIGN KEY ("recinto_id") REFERENCES "recintos"("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_eventos_recinto_horario" ON "eventos" ("recinto_id", "fecha_inicio", "fecha_fin")`);

    await queryRunner.query(`CREATE TABLE "localidades" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "zona_recinto_id" uuid, "nombre" character varying(120) NOT NULL, "precio" numeric(12,2) NOT NULL, "cantidad" integer NOT NULL, "orden" smallint NOT NULL DEFAULT 0, CONSTRAINT "PK_localidades" PRIMARY KEY ("id"), CONSTRAINT "UQ_localidades_nombre" UNIQUE ("evento_id", "nombre"), CONSTRAINT "CHK_localidades_precio" CHECK ("precio" >= 0), CONSTRAINT "CHK_localidades_cantidad" CHECK ("cantidad" > 0), CONSTRAINT "FK_localidades_evento" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE, CONSTRAINT "FK_localidades_zona" FOREIGN KEY ("zona_recinto_id") REFERENCES "zonas_recinto"("id"))`);

    await queryRunner.query(`CREATE TABLE "historial_eventos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "evento_id" uuid NOT NULL, "version" integer NOT NULL, "accion" character varying(40) NOT NULL, "estado_anterior" "evento_estado", "estado_nuevo" "evento_estado", "realizado_por" uuid NOT NULL, "cambios" jsonb NOT NULL DEFAULT '{}', "instantanea" jsonb, "fecha" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_historial_eventos" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_historial_eventos_evento" ON "historial_eventos" ("evento_id", "version")`);

    await queryRunner.query(`CREATE TABLE "eventos_salientes" ("secuencia" BIGSERIAL NOT NULL, "exchange" character varying(80) NOT NULL, "clave" character varying(80) NOT NULL, "cuerpo" jsonb NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "publicado_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_eventos_salientes" PRIMARY KEY ("secuencia"))`);
    await queryRunner.query(`CREATE INDEX "IDX_eventos_salientes_pendientes" ON "eventos_salientes" ("secuencia") WHERE "publicado_en" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "eventos_salientes"`);
    await queryRunner.query(`DROP TABLE "historial_eventos"`);
    await queryRunner.query(`DROP TABLE "localidades"`);
    await queryRunner.query(`DROP TABLE "eventos"`);
    await queryRunner.query(`DROP TYPE "evento_estado"`);
    await queryRunner.query(`DROP TABLE "zonas_recinto"`);
    await queryRunner.query(`DROP TABLE "recintos"`);
  }
}
