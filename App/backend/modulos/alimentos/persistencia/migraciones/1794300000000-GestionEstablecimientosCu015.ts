import { MigrationInterface, QueryRunner } from 'typeorm';

/** Aditiva: conserva identidades, relaciones, pedidos, estados e inventario. */
export class GestionEstablecimientosCu0151794300000000 implements MigrationInterface {
  name = 'GestionEstablecimientosCu0151794300000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE establecimientos
      ADD COLUMN contacto varchar(200) NOT NULL DEFAULT 'Pendiente de actualizar',
      ADD COLUMN hora_apertura time(0) NOT NULL DEFAULT '00:00',
      ADD COLUMN hora_cierre time(0) NOT NULL DEFAULT '00:00',
      ADD COLUMN zona_horaria varchar(80) NOT NULL DEFAULT 'America/Bogota'`);
    // Un conflicto previo aborta toda la migración; nunca renombrar/borrar datos para hacerlo pasar.
    await q.query(`CREATE UNIQUE INDEX uq_establecimiento_evento_nombre ON establecimientos
      (evento_id, lower(regexp_replace(btrim(nombre), '\\s+', ' ', 'g')))`);
    await q.query(`CREATE TABLE personal_establecimiento (
      establecimiento_id uuid NOT NULL REFERENCES establecimientos(id) ON DELETE RESTRICT,
      usuario_id uuid NOT NULL, asignado_por uuid NOT NULL,
      PRIMARY KEY (establecimiento_id, usuario_id))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE personal_establecimiento');
    await q.query('DROP INDEX uq_establecimiento_evento_nombre');
    await q.query('ALTER TABLE establecimientos DROP COLUMN contacto, DROP COLUMN hora_apertura, DROP COLUMN hora_cierre, DROP COLUMN zona_horaria');
  }
}
