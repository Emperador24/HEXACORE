import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial del Servicio de Entradas y Mercado Secundario (CU-006).
 *
 * Se escribe a mano en vez de generarse con `migration:generate` porque buena
 * parte de lo que importa aquí no lo produce el generador: los índices
 * parciales, las restricciones CHECK y el disparador que hace append-only el
 * historial. Esas tres cosas son las que convierten los umbrales "0 %" y
 * "100 %" de RNF-01, RNF-02 y RNF-11 en garantías del motor y no en promesas
 * del código de aplicación.
 */
export class EsquemaInicialCu0061789257600000 implements MigrationInterface {
  name = 'EsquemaInicialCu0061789257600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "entrada_estado" AS ENUM ('VALIDA', 'EN_REVENTA', 'USADA', 'ANULADA')
    `);
    await queryRunner.query(`
      CREATE TYPE "publicacion_estado" AS ENUM ('ACTIVA', 'VENDIDA', 'RETIRADA', 'EXPIRADA')
    `);
    await queryRunner.query(`
      CREATE TYPE "transaccion_estado" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FALLIDA', 'CANCELADA')
    `);
    await queryRunner.query(`
      CREATE TYPE "motivo_cambio_propietario" AS ENUM ('EMISION', 'REVENTA')
    `);

    // --- Proyección local del Evento (ver evento-referencia.entity.ts) ------
    await queryRunner.query(`
      CREATE TABLE "eventos_referencia" (
        "evento_id"       uuid PRIMARY KEY,
        "nombre"          varchar(200) NOT NULL,
        "fecha_inicio"    timestamptz  NOT NULL,
        "lugar"           varchar(200) NOT NULL,
        "ciudad"          varchar(120) NOT NULL,
        "permite_reventa" boolean      NOT NULL DEFAULT true,
        "actualizado_en"  timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // --- Entradas (SAD §12) -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "entradas" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "evento_id"        uuid NOT NULL,
        "localidad_id"     uuid NOT NULL,
        "localidad_nombre" varchar(120) NOT NULL,
        "propietario_id"   uuid NOT NULL,
        "codigo_qr"        varchar(64) NOT NULL,
        "estado"           "entrada_estado" NOT NULL DEFAULT 'VALIDA',
        "precio_original"  numeric(12,2) NOT NULL,
        "numero_ticket"    varchar(32) NOT NULL,
        "creada_en"        timestamptz NOT NULL DEFAULT now(),
        "actualizada_en"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_entradas_codigo_qr"     UNIQUE ("codigo_qr"),
        CONSTRAINT "uq_entradas_numero_ticket" UNIQUE ("numero_ticket"),
        CONSTRAINT "ck_entradas_precio_positivo" CHECK ("precio_original" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_entradas_propietario" ON "entradas" ("propietario_id")`);
    await queryRunner.query(`CREATE INDEX "idx_entradas_evento" ON "entradas" ("evento_id")`);

    // --- Publicaciones de reventa ------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "publicaciones_reventa" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entrada_id"        uuid NOT NULL,
        "vendedor_id"       uuid NOT NULL,
        "precio"            numeric(12,2) NOT NULL,
        "precio_original"   numeric(12,2) NOT NULL,
        "estado"            "publicacion_estado" NOT NULL DEFAULT 'ACTIVA',
        "comprador_id"      uuid NULL,
        "fecha_publicacion" timestamptz NOT NULL DEFAULT now(),
        "fecha_expiracion"  timestamptz NOT NULL,
        "fecha_cierre"      timestamptz NULL,
        "creada_en"         timestamptz NOT NULL DEFAULT now(),
        "actualizada_en"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_publicaciones_entrada"
          FOREIGN KEY ("entrada_id") REFERENCES "entradas" ("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_publicaciones_precio_positivo" CHECK ("precio" > 0),
        -- Una publicación ACTIVA no puede tener comprador, y una VENDIDA no
        -- puede no tenerlo. Sin esto, un fallo a medias podría dejar una venta
        -- sin comprador registrado y romper la trazabilidad de RNF-11.
        CONSTRAINT "ck_publicaciones_comprador_coherente" CHECK (
          ("estado" = 'VENDIDA' AND "comprador_id" IS NOT NULL) OR
          ("estado" <> 'VENDIDA' AND "comprador_id" IS NULL)
        ),
        -- Toda publicación que ya no está ACTIVA tiene fecha de cierre.
        CONSTRAINT "ck_publicaciones_cierre_coherente" CHECK (
          ("estado" = 'ACTIVA' AND "fecha_cierre" IS NULL) OR
          ("estado" <> 'ACTIVA' AND "fecha_cierre" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_publicaciones_estado" ON "publicaciones_reventa" ("estado")`);
    await queryRunner.query(`CREATE INDEX "idx_publicaciones_vendedor" ON "publicaciones_reventa" ("vendedor_id")`);
    await queryRunner.query(`
      CREATE INDEX "idx_publicaciones_mercado"
        ON "publicaciones_reventa" ("estado", "fecha_publicacion")
        WHERE "estado" = 'ACTIVA'
    `);

    // ESTE ÍNDICE ES LA RED DE SEGURIDAD DE RNF-01.
    //
    // El bloqueo de Redis (ADR-03) es la primera línea de defensa contra la
    // doble venta, pero Redis es un sistema aparte que puede caerse, reiniciarse
    // o perder el AOF. Este índice único parcial hace que "una entrada no puede
    // estar publicada dos veces a la vez" sea una imposibilidad física en el
    // motor, no una condición que el código recuerda comprobar.
    //
    // Es además la traducción literal de la multiplicidad que el propio modelo
    // de dominio del SAD §4 declara: Entrada — PublicaciónReventa = 0..1.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_publicacion_activa_por_entrada"
        ON "publicaciones_reventa" ("entrada_id")
        WHERE "estado" = 'ACTIVA'
    `);

    // --- Transacciones ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "transacciones_reventa" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "publicacion_id"      uuid NOT NULL,
        "entrada_id"          uuid NOT NULL,
        "comprador_id"        uuid NOT NULL,
        "vendedor_id"         uuid NOT NULL,
        "precio"              numeric(12,2) NOT NULL,
        "comision"            numeric(12,2) NOT NULL,
        "neto_vendedor"       numeric(12,2) NOT NULL,
        "estado"              "transaccion_estado" NOT NULL DEFAULT 'PENDIENTE',
        "referencia_pasarela" varchar(128) NULL,
        "motivo"              text NULL,
        "numero_transaccion"  varchar(32) NOT NULL,
        "creada_en"           timestamptz NOT NULL DEFAULT now(),
        "actualizada_en"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_transacciones_publicacion"
          FOREIGN KEY ("publicacion_id") REFERENCES "publicaciones_reventa" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_transacciones_entrada"
          FOREIGN KEY ("entrada_id") REFERENCES "entradas" ("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_transacciones_numero" UNIQUE ("numero_transaccion"),
        CONSTRAINT "ck_transacciones_importes_no_negativos" CHECK (
          "precio" > 0 AND "comision" >= 0 AND "neto_vendedor" >= 0
        ),
        -- El reparto tiene que cuadrar al centavo. Si el redondeo de la
        -- comisión se hace mal, la inserción falla aquí en vez de descuadrar
        -- la liquidación del vendedor (paso 13) sin que nadie se entere.
        CONSTRAINT "ck_transacciones_reparto_cuadra" CHECK (
          "precio" = "comision" + "neto_vendedor"
        ),
        -- Una transacción aprobada tiene que traer la referencia de la
        -- pasarela: es el único rastro del cobro que se conserva (RNF-05) y
        -- sin ella no se puede conciliar nada.
        CONSTRAINT "ck_transacciones_referencia_si_aprobada" CHECK (
          "estado" <> 'APROBADA' OR "referencia_pasarela" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transacciones_publicacion" ON "transacciones_reventa" ("publicacion_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_transacciones_comprador" ON "transacciones_reventa" ("comprador_id")`);
    await queryRunner.query(`CREATE INDEX "idx_transacciones_estado" ON "transacciones_reventa" ("estado")`);

    // --- Historial de propietarios (append-only) ----------------------------
    await queryRunner.query(`
      CREATE TABLE "historial_propietarios" (
        "id"                      bigserial PRIMARY KEY,
        "entrada_id"              uuid NOT NULL,
        "propietario_anterior_id" uuid NULL,
        "propietario_nuevo_id"    uuid NOT NULL,
        "motivo"                  "motivo_cambio_propietario" NOT NULL,
        "transaccion_id"          uuid NULL,
        "codigo_qr_anterior"      varchar(64) NULL,
        "codigo_qr_nuevo"         varchar(64) NOT NULL,
        "registrado_en"           timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_historial_entrada"
          FOREIGN KEY ("entrada_id") REFERENCES "entradas" ("id") ON DELETE RESTRICT,
        -- Una reventa siempre tiene dueño anterior y transacción; una emisión
        -- no tiene ninguno de los dos. Esto impide registrar una transferencia
        -- "huérfana" que después nadie pueda auditar.
        CONSTRAINT "ck_historial_coherente_con_motivo" CHECK (
          ("motivo" = 'EMISION' AND "propietario_anterior_id" IS NULL AND "transaccion_id" IS NULL) OR
          ("motivo" = 'REVENTA' AND "propietario_anterior_id" IS NOT NULL AND "transaccion_id" IS NOT NULL)
        ),
        -- Un cambio de propietario en el que el dueño no cambia no es un
        -- cambio: sería ruido en la auditoría.
        CONSTRAINT "ck_historial_propietario_cambia" CHECK (
          "propietario_anterior_id" IS NULL OR "propietario_anterior_id" <> "propietario_nuevo_id"
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_historial_entrada" ON "historial_propietarios" ("entrada_id", "id")`);

    // Append-only de verdad.
    //
    // ASR-07 pide un registro "consultable en un reporte de auditoría" y
    // RNF-11 exige retención ≥ 1 año. Un historial que cualquier UPDATE puede
    // reescribir no cumple ninguna de las dos cosas: la garantía tiene que
    // estar en el motor, porque un `save()` descuidado en cualquier punto del
    // servicio bastaría para falsificarlo.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "historial_propietarios_solo_insercion"()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'historial_propietarios es de solo inserción (auditoría CU-006 / RNF-11): % rechazado',
          TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_historial_propietarios_inmutable"
        BEFORE UPDATE OR DELETE ON "historial_propietarios"
        FOR EACH ROW EXECUTE FUNCTION "historial_propietarios_solo_insercion"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_historial_propietarios_inmutable" ON "historial_propietarios"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "historial_propietarios_solo_insercion"()`);
    await queryRunner.query(`DROP TABLE IF EXISTS "historial_propietarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transacciones_reventa"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "publicaciones_reventa"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "entradas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eventos_referencia"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "motivo_cambio_propietario"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaccion_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "publicacion_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "entrada_estado"`);
  }
}
