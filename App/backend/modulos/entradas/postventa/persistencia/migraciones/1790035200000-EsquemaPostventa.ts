import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema de Postventa (ADR-14, fase A): el mercado secundario con base propia.
 *
 * ## Qué se llevó y qué no
 *
 * Las tres tablas de aquí salieron del esquema de `ventas`:
 * `publicaciones_reventa`, `transacciones_reventa` y la proyección
 * `eventos_referencia`. **No** se llevó `entradas` ni `historial_propietarios`:
 * son de Ventas, que es quien manda sobre la propiedad de una entrada.
 *
 * ## Las llaves foráneas que se perdieron
 *
 * El esquema original tenía `fk_publicaciones_entrada` y
 * `fk_transacciones_entrada` apuntando a `entradas`. Al separar las bases ya no
 * pueden existir: PostgreSQL no tiene llaves foráneas entre bases distintas.
 *
 * Es exactamente la consecuencia que el ADR-01 anunciaba al elegir una base por
 * servicio, y aquí se paga en efectivo. `entrada_id` sigue siendo `uuid NOT
 * NULL` —sin él una publicación no significa nada— pero deja de haber una
 * garantía del motor de que ese uuid existe al otro lado. Quien la sostiene
 * ahora es la aplicación: Postventa nunca inventa un `entrada_id`, solo escribe
 * el que Ventas le devolvió al retener la entrada.
 *
 * Lo que **sí** se conserva es `uq_publicacion_activa_por_entrada`, que es el
 * índice que de verdad protege el RNF-01, y es local a esta tabla.
 *
 * ## Las columnas nuevas
 *
 * `evento_id`, `numero_ticket` y `localidad_nombre` no estaban en el esquema
 * original: allí se leían de `entradas` con un `JOIN`. Son la copia de lo que
 * se anuncia; el razonamiento está en `publicacion-reventa.entity.ts`.
 */
export class EsquemaPostventa1790035200000 implements MigrationInterface {
  name = 'EsquemaPostventa1790035200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TYPE "publicacion_estado" AS ENUM ('ACTIVA', 'VENDIDA', 'RETIRADA', 'EXPIRADA')
    `);
    await queryRunner.query(`
      CREATE TYPE "transaccion_estado" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FALLIDA', 'CANCELADA')
    `);

    // --- Proyección local del Evento (ver evento-referencia.entity.ts) ------
    //
    // Se copia y no se consulta a Eventos en cada petición: listar el mercado
    // necesita el nombre y la fecha de cada evento, y pedirlos por HTTP haría
    // que el mercado se cayera cada vez que se cayera Eventos. La alimenta el
    // consumidor de eventos de RabbitMQ (ADR-04).
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

    // --- Publicaciones ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "publicaciones_reventa" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Referencia a la entrada en la base de Ventas. Sin llave foránea: ver
        -- la cabecera de esta migración.
        "entrada_id"        uuid NOT NULL,
        "vendedor_id"       uuid NOT NULL,
        "precio"            numeric(12,2) NOT NULL,
        "precio_original"   numeric(12,2) NOT NULL,
        -- Copia de lo que se anuncia. No cambia mientras la publicación vive.
        "evento_id"         uuid NOT NULL,
        "numero_ticket"     varchar(40)  NOT NULL,
        "localidad_nombre"  varchar(120) NOT NULL,
        "estado"            "publicacion_estado" NOT NULL DEFAULT 'ACTIVA',
        "comprador_id"      uuid NULL,
        "fecha_publicacion" timestamptz NOT NULL DEFAULT now(),
        "fecha_expiracion"  timestamptz NOT NULL,
        "fecha_cierre"      timestamptz NULL,
        "creada_en"         timestamptz NOT NULL DEFAULT now(),
        "actualizada_en"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_publicaciones_precio_positivo" CHECK ("precio" > 0),
        -- El tope de reventa se valida en el código con el factor configurado,
        -- pero vender por debajo del original siempre es legítimo y por encima
        -- del original siempre necesita el tope: lo único que el motor puede
        -- afirmar sin conocer la configuración es que el original es positivo.
        CONSTRAINT "ck_publicaciones_original_positivo" CHECK ("precio_original" > 0),
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
    // Filtrar el mercado por evento ahora se resuelve en esta tabla, porque
    // `evento_id` está aquí. Antes era una condición sobre el `JOIN` a
    // `entradas`, que ya no existe.
    await queryRunner.query(`
      CREATE INDEX "idx_publicaciones_evento"
        ON "publicaciones_reventa" ("evento_id")
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
    //
    // Sobrevive intacto al corte de ADR-14: es local a esta tabla y no
    // dependía de la llave foránea que se perdió.
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
        -- Se conserva aunque sea derivable de la publicación: una transacción
        -- es el registro contable del cobro y tiene que poder leerse sola.
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
        -- Esta llave foránea SÍ se conserva: publicación y transacción viven
        -- las dos en esta base. La que apuntaba a "entradas" es la que se
        -- perdió al separar los servicios.
        CONSTRAINT "fk_transacciones_publicacion"
          FOREIGN KEY ("publicacion_id") REFERENCES "publicaciones_reventa" ("id") ON DELETE RESTRICT,
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
    // Conciliación por entrada: con qué transacción se cobró una entrada
    // concreta. Antes se podía llegar por la llave foránea; ahora hace falta
    // el índice explícito.
    await queryRunner.query(`CREATE INDEX "idx_transacciones_entrada" ON "transacciones_reventa" ("entrada_id")`);

    /**
     * Secuencia del número legible de transacción (`TXN-2026-000001`).
     *
     * Se usa una secuencia y no un contador en el código porque tiene que ser
     * único con varias réplicas corriendo a la vez (ASR-06): dos instancias
     * calculando "el siguiente número" por su cuenta chocarían contra
     * `uq_transacciones_numero` y tumbarían un checkout.
     *
     * Las secuencias no se reinician al abortar una transacción: si un checkout
     * falla, su número queda sin usar y habrá huecos. Es correcto — la
     * secuencia garantiza unicidad, no continuidad.
     */
    await queryRunner.query(`CREATE SEQUENCE "numero_transaccion_seq" START 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "numero_transaccion_seq"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transacciones_reventa"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "publicaciones_reventa"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eventos_referencia"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaccion_estado"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "publicacion_estado"`);
  }
}
