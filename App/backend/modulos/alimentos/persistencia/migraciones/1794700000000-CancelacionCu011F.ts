import { MigrationInterface, QueryRunner } from 'typeorm';

export class CancelacionCu011F1794700000000 implements MigrationInterface {
  name = 'CancelacionCu011F1794700000000';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE cancelaciones_pedido (
      pedido_id uuid PRIMARY KEY REFERENCES pedidos(id) ON DELETE RESTRICT,
      operacion_id uuid NOT NULL UNIQUE REFERENCES historial_preparacion(id) ON DELETE RESTRICT,
      establecimiento_id uuid NOT NULL REFERENCES establecimientos(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL, motivo varchar(200) NOT NULL CHECK(length(btrim(motivo)) BETWEEN 3 AND 200),
      cancelado_en timestamptz NOT NULL, huella char(64) NOT NULL,
      cobro_id uuid NOT NULL UNIQUE REFERENCES transacciones_pedido(id) ON DELETE RESTRICT,
      referencia_cobro varchar(128) NOT NULL CHECK(length(btrim(referencia_cobro))>0),
      monto numeric(12,2) NOT NULL CHECK(monto>0 AND monto<>'NaN'::numeric),
      moneda varchar(3) NOT NULL CHECK(moneda ~ '^[A-Z]{3}$'),
      reembolso_id uuid NOT NULL UNIQUE,
      estado_reembolso varchar(12) NOT NULL DEFAULT 'PENDIENTE'
        CHECK(estado_reembolso IN ('PENDIENTE','APROBADO','RECHAZADO','INCIERTO')),
      intentado_en timestamptz, resuelto_en timestamptz, referencia_reembolso varchar(128),
      politica_inventario varchar(32) NOT NULL
        CHECK(politica_inventario IN ('RESTITUIR_SIN_PREPARAR','NO_REINCORPORAR','REVISION')),
      estado_inventario varchar(20) NOT NULL
        CHECK(estado_inventario IN ('PENDIENTE','RESTITUIDO','NO_REINCORPORAR','REVISION')),
      operaciones_inventario jsonb NOT NULL CHECK(jsonb_typeof(operaciones_inventario)='array'),
      CHECK(estado_reembolso<>'APROBADO' OR (referencia_reembolso IS NOT NULL AND resuelto_en IS NOT NULL)))`);
    await q.query(`CREATE INDEX idx_cancelaciones_seguimiento ON cancelaciones_pedido(cancelado_en,pedido_id)
      WHERE estado_reembolso IN ('PENDIENTE','INCIERTO') OR estado_inventario='PENDIENTE'`);
  }
  async down(q: QueryRunner) { await q.query('DROP TABLE cancelaciones_pedido'); }
}
