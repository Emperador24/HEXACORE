import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreparacionCu0131794500000000 implements MigrationInterface {
  name = 'PreparacionCu0131794500000000';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE preparaciones_pedido (
      pedido_id uuid PRIMARY KEY REFERENCES pedidos(id) ON DELETE RESTRICT,
      estado varchar(24) NOT NULL DEFAULT 'RECIBIDO' CHECK(estado IN ('RECIBIDO','EN_PREPARACION','LISTO_PARA_ENTREGAR')),
      version integer NOT NULL DEFAULT 0 CHECK(version>=0),
      iniciado_en timestamptz, estimado_listo_en timestamptz, listo_en timestamptz,
      CHECK((estado='RECIBIDO' AND iniciado_en IS NULL AND estimado_listo_en IS NULL AND listo_en IS NULL)
        OR (estado='EN_PREPARACION' AND iniciado_en IS NOT NULL AND estimado_listo_en IS NOT NULL AND listo_en IS NULL)
        OR (estado='LISTO_PARA_ENTREGAR' AND iniciado_en IS NOT NULL AND estimado_listo_en IS NOT NULL AND listo_en IS NOT NULL)))`);
    await q.query(`CREATE TABLE historial_preparacion (
      id uuid PRIMARY KEY, pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
      actor_id uuid NOT NULL, accion varchar(30) NOT NULL, huella char(64) NOT NULL,
      version_anterior integer NOT NULL, version_nueva integer NOT NULL,
      datos jsonb NOT NULL, resultado jsonb NOT NULL, aviso text NOT NULL, creado_en timestamptz NOT NULL,
      UNIQUE(pedido_id,version_nueva), CHECK(version_nueva=version_anterior+1))`);
    await q.query(`CREATE INDEX idx_historial_preparacion_pedido ON historial_preparacion(pedido_id,creado_en)`);
    await q.query(`CREATE TABLE incidencias_preparacion (
      id uuid PRIMARY KEY, pedido_id uuid NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
      producto_id uuid REFERENCES productos(id) ON DELETE RESTRICT, descripcion text NOT NULL,
      actor_id uuid NOT NULL, creada_en timestamptz NOT NULL,
      resuelta_en timestamptz, resuelta_por uuid, resolucion text,
      CHECK((resuelta_en IS NULL AND resuelta_por IS NULL AND resolucion IS NULL)
         OR (resuelta_en IS NOT NULL AND resuelta_por IS NOT NULL AND resolucion IS NOT NULL)))`);
    await q.query(`CREATE INDEX idx_incidencias_preparacion_abiertas ON incidencias_preparacion(pedido_id) WHERE resuelta_en IS NULL`);
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE incidencias_preparacion');
    await q.query('DROP TABLE historial_preparacion');
    await q.query('DROP TABLE preparaciones_pedido');
  }
}
