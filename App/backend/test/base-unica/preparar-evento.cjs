const assert = require('node:assert/strict');
const { Client } = require('pg');
const { opcionesPg, base } = require('./conexiones.cjs');

// Solo para las aplicaciones actuales en bases exclusivas de prueba. No
// publica mensajes ni participa en la preparación del origen histórico.
async function prepararEvento(eventoId, creadoPor) {
  const db = new Client(opcionesPg('eventos'));
  await db.connect();
  try {
    const sesion = (await db.query('SELECT current_database() b,current_schema() e')).rows[0];
    assert.deepEqual(sesion, { b: base, e: 'eventos_recintos' });
    await db.query('BEGIN');
    const recinto = (await db.query("INSERT INTO recintos(nombre,ciudad,capacidad) VALUES($1,'Bogotá',100) RETURNING id", ['Ensayo ' + eventoId])).rows[0];
    await db.query("INSERT INTO eventos(id,nombre,categoria,recinto_id,fecha_inicio,fecha_fin,aforo_maximo,estado,creado_por,publicado_en) VALUES($1,'Ensayo','Conciertos',$2,now()+interval '30 days',now()+interval '31 days',100,'PUBLICADO',$3,now())", [eventoId, recinto.id, creadoPor]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

module.exports = { prepararEvento };
