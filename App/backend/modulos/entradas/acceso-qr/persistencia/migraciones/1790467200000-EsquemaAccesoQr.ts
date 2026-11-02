import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema de la base propia de Acceso QR (ADR-14).
 *
 * Dos tablas: los ingresos, que son suyos, y la proyección del evento con el
 * aforo. **No está `entradas`**: es de Ventas, y aquí se pide gastar un QR, no
 * se decide.
 *
 * ## La llave foránea que se pierde
 *
 * Mientras compartían base, `ingresos.entrada_id` tenía un `FOREIGN KEY` a
 * `entradas`. Al separarse no puede seguir: están en bases distintas. Es la
 * consecuencia que ADR-01 ya aceptó por escrito —*"las referencias entre
 * dominios se resuelven en la aplicación, con el identificador, y no con
 * llaves foráneas físicas"*— y conviene saber qué se pierde con ella: ya nada
 * impide a nivel de motor insertar un ingreso con un `entrada_id` inventado.
 *
 * Lo que lo impide ahora es el orden de la Saga: aquí solo se inserta después
 * de que Ventas haya confirmado la entrada y devuelto su id.
 *
 * El `UNIQUE (entrada_id)` **sí se conserva**, y es importante: es la segunda
 * defensa contra el doble ingreso, la que actúa si dos puertas llegaran a
 * pasar el filtro de Ventas en el mismo instante.
 */
export class EsquemaAccesoQr1790467200000 implements MigrationInterface {
  name = 'EsquemaAccesoQr1790467200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "evento_estado" AS ENUM ('BORRADOR', 'PUBLICADO', 'CANCELADO')`);
    await queryRunner.query(`CREATE TYPE "ingreso_origen" AS ENUM ('EN_LINEA', 'SINCRONIZADO')`);

    await queryRunner.query(`
      CREATE TABLE "eventos_referencia" (
        "evento_id"      uuid PRIMARY KEY,
        "nombre"         varchar(200) NOT NULL,
        "fecha_inicio"   timestamptz  NOT NULL,
        "fecha_fin"      timestamptz  NULL,
        "lugar"          varchar(200) NOT NULL,
        "ciudad"         varchar(120) NOT NULL,
        "estado"         "evento_estado" NOT NULL,
        "aforo_maximo"   integer      NULL,
        "asistentes"     integer      NOT NULL DEFAULT 0,
        "actualizado_en" timestamptz  NOT NULL DEFAULT now(),
        -- El conteo nunca puede ser negativo ni pasar del aforo. Lo segundo ya
        -- lo garantiza el UPDATE condicionado, pero una restricción no cuesta
        -- nada y convierte un error de código en un error de base.
        CONSTRAINT "ck_eventos_asistentes_en_rango"
          CHECK ("asistentes" >= 0 AND ("aforo_maximo" IS NULL OR "asistentes" <= "aforo_maximo"))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ingresos" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entrada_id"    uuid NOT NULL,
        "evento_id"     uuid NOT NULL,
        "validado_por"  uuid NOT NULL,
        "punto_acceso"  varchar(60) NULL,
        "origen"        "ingreso_origen" NOT NULL,
        "escaneado_en"  timestamptz NOT NULL,
        "registrado_en" timestamptz NOT NULL DEFAULT now(),
        -- Una entrada, un ingreso. Si dos puertas escanean el mismo QR en el
        -- mismo milisegundo, el segundo falla aquí.
        CONSTRAINT "uq_ingresos_entrada" UNIQUE ("entrada_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_ingresos_evento" ON "ingresos" ("evento_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ingresos"`);
    await queryRunner.query(`DROP TABLE "eventos_referencia"`);
    await queryRunner.query(`DROP TYPE "ingreso_origen"`);
    await queryRunner.query(`DROP TYPE "evento_estado"`);
  }
}
