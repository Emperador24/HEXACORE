// Cuentas exclusivas en base nueva. Los permisos propios son fixture, no desarrollo de CU-028.
const { randomUUID, randomBytes } = require('node:crypto');
const c = require('./parqueaderos-comun.cjs');
async function sesion(actor, servidor = c.base) {
  const f = c.leer('fixture-operacion.json');
  const r = await c.peticion('/api/v1/sesiones', { servidor, metodo: 'POST', cuerpo: { email: f.actores[actor].email, contrasena: f.clave } });
  c.assert.equal(r.estado, 200); return r.datos;
}
async function main() {
  c.guarda();
  const db = await c.conexion();
  const f = c.fs.existsSync(c.path.join(c.privado(), 'fixture-operacion.json')) ? c.leer('fixture-operacion.json')
    : { codigo: 'SEG-O-' + randomUUID().slice(0, 8), clave: randomBytes(24).toString('base64url') + '!aA1', actores: {}, roles: {}, estado: 'EN_CURSO' };
  c.assert(f.estado === 'EN_CURSO' && Object.keys(f.actores).length === 0, 'No repetir preparación completa o de cuentas parciales');
  c.guardar('fixture-operacion.json', f);
  try {
    c.assert.equal((await db.ds.query('SELECT count(*)::int n FROM identidad.usuarios'))[0].n, 0, 'Base nueva sin destinatarios anteriores');
    const { cifrarContrasena } = c.cargar(c.path.join(c.backend, 'dist/modulos/identidad/comun/contrasenas'));
    const hash = await cifrarContrasena(f.clave);
    for (const accion of ['leer', 'crear', 'actualizar']) {
      const nombre = f.codigo + '-' + accion;
      const rol = await db.ds.transaction(async m => {
        // El trigger de permisos usa el esquema de Identidad igual que su servicio.
        await m.query('SET LOCAL search_path=identidad,pg_catalog,extensiones');
        let [fila] = await m.query('SELECT id FROM roles WHERE nombre=$1 AND NOT del_sistema', [nombre]);
        if (!fila) [fila] = await m.query("INSERT INTO roles(nombre,descripcion,del_sistema) VALUES($1,'Fixture exclusiva de seguridad',false) RETURNING id", [nombre]);
        for (const modulo of ['emergencias', 'reportes']) await m.query('INSERT INTO permisos_roles(rol_id,modulo,accion) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [fila.id, modulo, accion]);
        return fila;
      });
      await db.redis.sadd('permisos-rol:' + nombre, 'emergencias:' + accion, 'reportes:' + accion);
      f.roles[accion] = { id: rol.id, nombre, version: 1 };
    }
    for (const [actor, rol] of Object.entries({ cliente: 'Cliente', personal: 'Personal', otroPersonal: 'Personal', organizador: 'Organizador', otroOrganizador: 'Organizador', admin: 'Administrador', lector: f.roles.leer.nombre, creador: f.roles.crear.nombre, actualizador: f.roles.actualizar.nombre })) {
      const id = randomUUID(), email = `${f.codigo}-${actor}@example.test`.toLowerCase();
      await db.ds.transaction(async m => {
        await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())", [id, f.codigo + ' ' + actor, email, hash]);
        await m.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2', [id, rol]);
      }); f.actores[actor] = { id, email, rol }; c.guardar('fixture-operacion.json', f);
    }
    f.estado = 'COMPLETA'; c.guardar('fixture-operacion.json', f);
    console.log('Nueve cuentas y tres roles propios exclusivos; base inicialmente sin usuarios. Sin semillas ni canales externos.');
  } finally { await db.cerrar(); }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { sesion };
