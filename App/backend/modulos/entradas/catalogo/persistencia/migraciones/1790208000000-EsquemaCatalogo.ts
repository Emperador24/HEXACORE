import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema de la base propia del Catálogo (ADR-14, fase A).
 *
 * Son las dos tablas que la cartelera (CU-005) lee, con la misma forma que
 * tenían dentro de `ventas`. No se copian las columnas
 * que allí usaban otros módulos —`permite_reventa` es de Postventa y
 * `aforo_maximo`/`asistentes` de Acceso QR—: una proyección lleva lo que su
 * consumidor necesita.
 *
 * Las dos tablas son una **proyección de sólo lectura**. Hoy la siembra
 * `npm run semilla`; cuando exista Eventos y recintos la mantendrá al día el
 * evento `EventoPublicado`. Nada de este servicio las escribe en caliente, y
 * por eso no llevan las garantías de concurrencia que sí tiene el inventario
 * en Ventas.
 */
export class EsquemaCatalogo1790208000000 implements MigrationInterface {
  name = 'EsquemaCatalogo1790208000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "evento_estado" AS ENUM ('BORRADOR', 'PUBLICADO', 'CANCELADO')
    `);

    await queryRunner.query(`
      CREATE TABLE "eventos_referencia" (
        "evento_id"      uuid PRIMARY KEY,
        "nombre"         varchar(200) NOT NULL,
        "fecha_inicio"   timestamptz  NOT NULL,
        "fecha_fin"      timestamptz  NULL,
        "lugar"          varchar(200) NOT NULL,
        "ciudad"         varchar(120) NOT NULL,
        "estado"         "evento_estado" NOT NULL,
        "categoria"      varchar(60)  NOT NULL,
        "artista"        varchar(200) NULL,
        "descripcion"    text         NULL,
        "imagen_url"     varchar(500) NULL,
        "actualizado_en" timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // Los tres filtros del CU-005. Van sobre lower() porque la cartelera
    // compara sin distinguir mayúsculas: sin eso el índice no se usaría.
    await queryRunner.query(`CREATE INDEX "idx_eventos_ciudad" ON "eventos_referencia" (lower("ciudad"))`);
    await queryRunner.query(`CREATE INDEX "idx_eventos_categoria" ON "eventos_referencia" (lower("categoria"))`);
    await queryRunner.query(`CREATE INDEX "idx_eventos_artista" ON "eventos_referencia" (lower("artista"))`);
    // El orden por defecto de la cartelera: los que vienen antes, primero.
    await queryRunner.query(`CREATE INDEX "idx_eventos_fecha_inicio" ON "eventos_referencia" ("fecha_inicio")`);

    await queryRunner.query(`
      CREATE TABLE "localidades_evento" (
        "localidad_id"   uuid PRIMARY KEY,
        "evento_id"      uuid NOT NULL,
        "nombre"         varchar(120) NOT NULL,
        "precio"         numeric(12,2) NOT NULL,
        "aforo"          integer NOT NULL,
        "vendidas"       integer NOT NULL DEFAULT 0,
        "reservadas"     integer NOT NULL DEFAULT 0,
        "orden"          smallint NOT NULL DEFAULT 0,
        "actualizada_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_localidades_nombre_por_evento" UNIQUE ("evento_id", "nombre"),
        CONSTRAINT "ck_localidades_precio_positivo" CHECK ("precio" > 0),
        CONSTRAINT "ck_localidades_aforo_positivo"  CHECK ("aforo" > 0),
        CONSTRAINT "ck_localidades_cupo_en_rango"
          CHECK ("vendidas" >= 0 AND "reservadas" >= 0 AND "vendidas" + "reservadas" <= "aforo")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_localidades_evento" ON "localidades_evento" ("evento_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "localidades_evento"`);
    await queryRunner.query(`DROP TABLE "eventos_referencia"`);
    await queryRunner.query(`DROP TYPE "evento_estado"`);
  }
}
