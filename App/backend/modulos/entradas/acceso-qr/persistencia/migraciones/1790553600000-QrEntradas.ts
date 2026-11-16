import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La copia de los QR que tiene la puerta (ADR-15).
 *
 * Hasta ADR-15 Acceso QR le pedía a Ventas gastar cada QR. Ahora el diagrama de
 * contenedores no tiene esa flecha: la puerta valida contra esta tabla, que se
 * alimenta de `CompraConfirmada` y `EntradaActualizada`.
 *
 * Guarda el **hash** del código, no el código. A la puerta le basta con
 * comparar, y el dispositivo que valida sin red descarga estos mismos hashes.
 *
 * `secuencia` es la del evento que dejó la fila así. Dos cambios de la misma
 * entrada pueden llegar desordenados; uno con secuencia menor que la guardada
 * es viejo y se descarta.
 */
export class QrEntradas1790553600000 implements MigrationInterface {
  name = 'QrEntradas1790553600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "qr_entradas" (
        "entrada_id"       uuid PRIMARY KEY,
        "evento_id"        uuid NOT NULL,
        "hash_qr"          char(64) NOT NULL,
        "numero_ticket"    varchar(32) NOT NULL,
        "localidad_nombre" varchar(120) NOT NULL,
        "estado"           varchar(12) NOT NULL,
        "secuencia"        bigint NOT NULL,
        "actualizado_en"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_qr_entradas_hash" UNIQUE ("hash_qr"),
        CONSTRAINT "ck_qr_entradas_estado" CHECK ("estado" IN ('VALIDA', 'EN_REVENTA', 'USADA', 'ANULADA'))
      )
    `);
    // La caché para operar sin red pide los VALIDA de un evento.
    await queryRunner.query(`CREATE INDEX "idx_qr_entradas_evento_estado" ON "qr_entradas" ("evento_id", "estado")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "qr_entradas"`);
  }
}
