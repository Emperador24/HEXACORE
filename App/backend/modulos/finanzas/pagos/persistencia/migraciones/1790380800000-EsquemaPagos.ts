import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema de la base propia de Pagos (ADR-14).
 *
 * Una sola tabla: el libro de idempotencia. Pagos no guarda el pedido ni la
 * compra —eso es de quien llama—, solo si una operación ya se hizo y cómo
 * terminó.
 */
export class EsquemaPagos1790380800000 implements MigrationInterface {
  name = 'EsquemaPagos1790380800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "tipo_operacion_pago" AS ENUM ('COBRO', 'REEMBOLSO')`);
    await queryRunner.query(`CREATE TYPE "resultado_cobro" AS ENUM ('APROBADO', 'RECHAZADO', 'INDETERMINADO')`);

    await queryRunner.query(`
      CREATE TABLE "transacciones_pago" (
        "clave_idempotencia" varchar(128) PRIMARY KEY,
        "tipo"            "tipo_operacion_pago" NOT NULL,
        "solicitante"     varchar(60)  NOT NULL,
        "monto"           numeric(12,2) NOT NULL,
        "moneda"          varchar(3)   NOT NULL,
        "resultado"       "resultado_cobro" NOT NULL,
        "referencia"      varchar(128) NULL,
        "motivo"          varchar(120) NULL,
        "intentos"        integer      NOT NULL DEFAULT 1,
        "creada_en"       timestamptz  NOT NULL DEFAULT now(),
        "actualizada_en"  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "ck_pagos_monto_positivo" CHECK ("monto" > 0),
        CONSTRAINT "ck_pagos_intentos_positivo" CHECK ("intentos" >= 1),
        -- Un resultado APROBADO sin referencia de la pasarela no se puede
        -- auditar ni reembolsar: no debe poder existir.
        CONSTRAINT "ck_pagos_aprobado_con_referencia"
          CHECK ("resultado" <> 'APROBADO' OR "referencia" IS NOT NULL)
      )
    `);

    // Para encontrar lo que quedó sin resolver: es la cola de reconciliación
    // del SAD §13. Parcial porque solo interesan los indeterminados.
    await queryRunner.query(`
      CREATE INDEX "idx_pagos_sin_resolver" ON "transacciones_pago" ("creada_en")
       WHERE "resultado" = 'INDETERMINADO'
    `);
    await queryRunner.query(`CREATE INDEX "idx_pagos_solicitante" ON "transacciones_pago" ("solicitante", "creada_en")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transacciones_pago"`);
    await queryRunner.query(`DROP TYPE "resultado_cobro"`);
    await queryRunner.query(`DROP TYPE "tipo_operacion_pago"`);
  }
}
