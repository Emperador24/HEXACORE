// Solo cuentas/recursos nuevos; reutiliza el preparador acotado, nunca semillas.
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const c = require('./comun.cjs');
async function main() {
  c.guarda();
  c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'fixture.json')), 'No duplicar una preparación iniciada');
  const r = spawnSync(process.execPath, [c.path.join(__dirname, 'preparar.cjs')], { env: process.env, stdio: 'inherit' });
  c.assert.equal(r.status, 0, 'Conservar cualquier fixture parcial y diagnosticar');
  const f = c.leer('fixture.json'), db = await c.conexion();
  try {
    const { cifrarContrasena } = c.cargar(c.path.join(c.backend, 'dist/modulos/identidad/comun/contrasenas'));
    const id = randomUUID(), email = `${f.codigo}-organizador-b@example.test`.toLowerCase();
    await db.ds.transaction(async m => {
      await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())",
        [id, f.codigo + ' Organizador B', email, await cifrarContrasena(f.clave)]);
      await m.query("INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre='Organizador'", [id]);
    });
    f.actores.organizadorB = { id, email, rol: 'Organizador' };
    f.alimentos = { estado: 'COMPLETA' }; c.guardar('fixture.json', f);
    console.log('Fixture Alimentos completa: siete cuentas nuevas; datos anteriores conservados.');
  } finally { await db.cerrar(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
