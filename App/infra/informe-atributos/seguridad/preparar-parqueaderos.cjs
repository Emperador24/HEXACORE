// Solo altas nuevas en la base descartable, sin semillas ni cambios de cuentas anteriores.
const { randomUUID, randomBytes } = require('node:crypto');
const c = require('./parqueaderos-comun.cjs');
async function iniciarSesion(actor, servidor = c.base) {
  const f = c.leer('fixture-parqueaderos.json');
  const r = await c.peticion('/api/v1/sesiones', { servidor, metodo: 'POST', cuerpo: { email: f.actores[actor].email, contrasena: f.clave } });
  c.assert.equal(r.estado, 200, 'Sesión propia válida'); return r.datos;
}
async function evento(token, servidor = c.base) {
  async function alta(ruta, cuerpo, esperado = 201) {
    const r = await c.peticion('/api/v1' + ruta, { servidor, metodo: 'POST', token, cuerpo }); c.assert.equal(r.estado, esperado, ruta); return r.datos;
  }
  const nombre = 'SEG-P-' + randomUUID().slice(0, 8);
  const recinto = (await alta('/recintos', { nombre, ciudad: 'Bogotá', direccion: 'Ensayo exclusivo', capacidad: 1000, zonas: [] })).recinto;
  const e = (await alta('/eventos', { nombre, categoria: 'Ensayo seguridad', recintoId: recinto.id,
    fechaInicio: new Date(Date.now() + 86400000).toISOString(), fechaFin: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    aforoMaximo: 1000, permiteReventa: false, localidades: [{ nombre: 'General', precio: 1000, cantidad: 1000 }] })).evento;
  await alta('/eventos/' + e.id + '/publicar', { version: e.version }, 200); return e.id;
}
async function main() {
  c.guarda(); c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'fixture-parqueaderos.json')));
  const f = { codigo: 'SEG-P-' + randomUUID().slice(0, 8), clave: randomBytes(24).toString('base64url') + '!aA1', actores: {}, estado: 'EN_CURSO' };
  c.guardar('fixture-parqueaderos.json', f); const db = await c.conexion();
  try {
    const { cifrarContrasena } = c.cargar(c.path.join(c.backend, 'dist/modulos/identidad/comun/contrasenas'));
    const hash = await cifrarContrasena(f.clave);
    for (const [a, rol] of Object.entries({ cliente: 'Cliente', ajeno: 'Cliente', personal: 'Personal', otroPersonal: 'Personal', organizador: 'Organizador', otroOrganizador: 'Organizador', admin: 'Administrador' })) {
      const id = randomUUID(), email = `${f.codigo}-${a}@example.test`.toLowerCase();
      await db.ds.transaction(async m => {
        await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())", [id, f.codigo + ' ' + a, email, hash]);
        await m.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2', [id, rol]);
      }); f.actores[a] = { id, email, rol }; c.guardar('fixture-parqueaderos.json', f);
    }
    f.estado = 'COMPLETA'; c.guardar('fixture-parqueaderos.json', f);
    const sesion = await iniciarSesion('admin');
    const tarifa = await c.peticion('/api/v1/parqueaderos/tarifa', { metodo: 'PUT', token: sesion.token, cuerpo: { valorHora: 5000, motivo: 'Ensayo en base descartable' } }); c.assert.equal(tarifa.estado, 200);
    console.log('Siete cuentas nuevas y tarifa exclusiva listas en base descartable.');
  } finally { await db.cerrar(); }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { iniciarSesion, evento };
