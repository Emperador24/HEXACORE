import { MigrationInterface, QueryRunner } from 'typeorm';

export class EntregaCu0141794600000000 implements MigrationInterface {
  name = 'EntregaCu0141794600000000';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE entregas_pedido (
      pedido_id uuid PRIMARY KEY REFERENCES pedidos(id) ON DELETE RESTRICT,
      operacion_id uuid NOT NULL UNIQUE REFERENCES historial_preparacion(id) ON DELETE RESTRICT,
      establecimiento_id uuid NOT NULL REFERENCES establecimientos(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL, punto_entrega text NOT NULL CHECK(length(btrim(punto_entrega))>0),
      entregado_en timestamptz NOT NULL, qr_huella char(64) NOT NULL CHECK(qr_huella ~ '^[a-f0-9]{64}$'))`);
    // El secreto no se pasa como parámetro a SQL ni se escribe en nuevos registros.
    await q.query(`CREATE INDEX idx_pedidos_punto_qr_huella ON pedidos
      (establecimiento_id, (encode(extensiones.digest(codigo_qr,'sha256'),'hex'))) WHERE codigo_qr IS NOT NULL`);
  }
  async down(q: QueryRunner) {
    await q.query('DROP INDEX idx_pedidos_punto_qr_huella');
    await q.query('DROP TABLE entregas_pedido');
  }
}
