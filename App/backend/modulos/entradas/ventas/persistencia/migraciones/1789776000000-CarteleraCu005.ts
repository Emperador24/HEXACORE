import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * (CU-005): amplía la proyección del Evento para la consultar filtrar 
 * y muestrar, y añade las localidades con su disponibilidad.
 *
 * Timestamp escrita a mano, los CHECK y los índices parciales no los produce
 *  `migration:generate`
 * 
 * nunca se vende por encima del aforo
 */
export class CarteleraCu0051789776000000 implements MigrationInterface {
  name = 'CarteleraCu0051789776000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "evento_estado" AS ENUM ('BORRADOR', 'PUBLICADO', 'CANCELADO')
    `);

    // Proyeccion del Evento (copia local ADR-01) CU-005
    // categoria y estado son obligatorias, pero la tabla ya puede tener las
    // filas de la reventa. se anaden con un valor por defecto para rellenarlas
    // y después se quita: de aqui en adelante, quien inserte debe decirlas.
    //
    // El defecto de estado es PUBLICADO solo para ese relleno, porque los
    // eventos de la reventa ya estan a la venta. 
    // dejarlo puesto seria peligroso: un INSERT que olvide el estado 
    // publicaria el evento en la cartelera con entradas a la venta. 

    await queryRunner.query(`
      ALTER TABLE "eventos_referencia"
        ADD COLUMN "estado" "evento_estado" NOT NULL DEFAULT 'PUBLICADO',
        ADD COLUMN "categoria" varchar(60)  NOT NULL DEFAULT 'Otros',
        ADD COLUMN "artista" varchar(200) NULL,
        ADD COLUMN "descripcion" text NULL,
        ADD COLUMN "fecha_fin" timestamptz  NULL,
        ADD COLUMN "imagen_url" varchar(500) NULL,
        ADD CONSTRAINT "ck_eventos_fin_despues_de_inicio"
          CHECK ("fecha_fin" IS NULL OR "fecha_fin" > "fecha_inicio")
    `);
    await queryRunner.query(`
      ALTER TABLE "eventos_referencia"
        ALTER COLUMN "categoria" DROP DEFAULT,
        ALTER COLUMN "estado" DROP DEFAULT
    `);

    // Indice parcial: los borradores y cancelados nunca se listan, no ocupan índice.
    await queryRunner.query(`
      CREATE INDEX "idx_eventos_cartelera"
        ON "eventos_referencia" ("fecha_inicio")
        WHERE "estado" = 'PUBLICADO'
    `);
    // Indice con mayus o minus
    await queryRunner.query(`CREATE INDEX "idx_eventos_categoria" ON "eventos_referencia" (lower("categoria"))`);
    await queryRunner.query(`CREATE INDEX "idx_eventos_ciudad" ON "eventos_referencia" (lower("ciudad"))`);
    await queryRunner.query(`
      CREATE TABLE "localidades_evento" (
        "localidad_id" uuid PRIMARY KEY,
        "evento_id" uuid NOT NULL,
        "nombre" varchar(120) NOT NULL,
        "precio" numeric(12,2) NOT NULL,
        "aforo" integer NOT NULL,
        "vendidas" integer NOT NULL DEFAULT 0,
        "orden" smallint NOT NULL DEFAULT 0,
        "actualizada_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_localidades_nombre_por_evento" UNIQUE ("evento_id", "nombre"),
        CONSTRAINT "ck_localidades_precio_positivo" CHECK ("precio" > 0),
        CONSTRAINT "ck_localidades_aforo_positivo"  CHECK ("aforo" > 0),
        -- GARANTIA CONTRA LA SOBREVENTA CU001
        CONSTRAINT "ck_localidades_vendidas_en_rango" CHECK ("vendidas" >= 0 AND "vendidas" <= "aforo"))`);
    await queryRunner.query(`CREATE INDEX "idx_localidades_evento" ON "localidades_evento" ("evento_id")`);}

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "localidades_evento"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eventos_ciudad"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eventos_categoria"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_eventos_cartelera"`);
    await queryRunner.query(`
      ALTER TABLE "eventos_referencia"
        DROP CONSTRAINT IF EXISTS "ck_eventos_fin_despues_de_inicio",
        DROP COLUMN IF EXISTS "imagen_url",
        DROP COLUMN IF EXISTS "fecha_fin",
        DROP COLUMN IF EXISTS "descripcion",
        DROP COLUMN IF EXISTS "artista",
        DROP COLUMN IF EXISTS "categoria",
        DROP COLUMN IF EXISTS "estado"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "evento_estado"`);
  }
}
