// Solo cuentas nuevas en la base vacía creada por el preparador de aislamiento.
const { randomUUID, randomBytes } = require('node:crypto');
const c = require('./parqueaderos-comun.cjs');
async function sesion(actor, servidor = c.base) {
  const f = c.leer('fixture-eventos.json'); const r = await c.peticion('/api/v1/sesiones', { servidor, metodo: 'POST', cuerpo: { email: f.actores[actor].email, contrasena: f.clave } });
  c.assert.equal(r.estado, 200); return r.datos;
}
async function main() {
  c.guarda(); c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'fixture-eventos.json')));
  const f = { codigo: 'SEG-E-' + randomUUID().slice(0, 8), clave: randomBytes(24).toString('base64url') + '!aA1', actores: {}, estado: 'EN_CURSO' };
  c.guardar('fixture-eventos.json', f); const db = await c.conexion();
  try {
    const { cifrarContrasena } = c.cargar(c.path.join(c.backend, 'dist/modulos/identidad/comun/contrasenas'));
    const hash = await cifrarContrasena(f.clave);
    for (const [actor, rol] of Object.entries({ cliente: 'Cliente', personal: 'Personal', organizador: 'Organizador', otroOrganizador: 'Organizador', admin: 'Administrador' })) {
      const id = randomUUID(), email = `${f.codigo}-${actor}@example.test`.toLowerCase();
      await db.ds.transaction(async m => {
        await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())", [id, f.codigo + ' ' + actor, email, hash]);
        await m.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2', [id, rol]);
      }); f.actores[actor] = { id, email, rol }; c.guardar('fixture-eventos.json', f);
    }
    f.estado = 'COMPLETA'; c.guardar('fixture-eventos.json', f); console.log('Cinco cuentas nuevas preparadas; sin semillas de dominio.');
  } finally { await db.cerrar(); }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { sesion };
