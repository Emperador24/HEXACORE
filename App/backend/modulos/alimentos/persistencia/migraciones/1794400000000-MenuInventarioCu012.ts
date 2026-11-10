import { MigrationInterface, QueryRunner } from 'typeorm';
export class MenuInventarioCu0121794400000000 implements MigrationInterface {
  name = 'MenuInventarioCu0121794400000000';
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE productos ADD COLUMN restricciones_alimentarias jsonb NOT NULL DEFAULT '[]'::jsonb
      CHECK(jsonb_typeof(restricciones_alimentarias)='array')`);
    await q.query(`CREATE UNIQUE INDEX uq_producto_establecimiento_nombre ON productos
      (establecimiento_id, lower(regexp_replace(btrim(nombre), '\\s+', ' ', 'g')))`);
    await q.query(`ALTER TABLE detalles_pedido ADD COLUMN descripcion_producto text,
      ADD COLUMN restricciones_alimentarias jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await q.query(`CREATE TABLE operaciones_inventario (
      id uuid PRIMARY KEY, secuencia bigserial NOT NULL UNIQUE,
      establecimiento_id uuid NOT NULL REFERENCES establecimientos(id) ON DELETE RESTRICT,
      producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL, tipo varchar(10) NOT NULL CHECK(tipo IN ('ALTA','AJUSTE')),
      delta integer NOT NULL, motivo varchar(500) NOT NULL, huella char(64) NOT NULL,
      peticion jsonb NOT NULL, inicializa boolean NOT NULL DEFAULT false,
      estado varchar(12) NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','APLICADA','RECHAZADA')),
      codigo varchar(80), fisico_antes integer, fisico_despues integer,
      disponible_antes integer, disponible_despues integer,
      creada_en timestamptz NOT NULL DEFAULT now(), terminada_en timestamptz)`);
    await q.query(`CREATE INDEX idx_operaciones_inventario_pendientes ON operaciones_inventario(establecimiento_id,secuencia) WHERE estado='PENDIENTE'`);
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE operaciones_inventario');
    await q.query('ALTER TABLE detalles_pedido DROP COLUMN descripcion_producto, DROP COLUMN restricciones_alimentarias');
    await q.query('DROP INDEX uq_producto_establecimiento_nombre');
    await q.query('ALTER TABLE productos DROP COLUMN restricciones_alimentarias');
  }
}
