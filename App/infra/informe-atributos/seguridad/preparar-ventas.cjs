// Cuentas nuevas y evento exclusivo. No semillas, truncados ni cambios de claves anteriores.
const { randomUUID, randomBytes } = require('node:crypto');
const c = require('./comun.cjs');
async function main() {
  c.guarda(); c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'fixture.json')));
  const f = { codigo: 'SEG-V-' + randomUUID().slice(0, 8), clave: randomBytes(24).toString('base64url') + '!aA1', actores: {}, estado: 'EN_CURSO' };
  c.guardar('fixture.json', f);
  const db = await c.conexion();
  try {
    const { cifrarContrasena } = c.cargar(c.path.join(c.backend, 'dist/modulos/identidad/comun/contrasenas'));
    const hash = await cifrarContrasena(f.clave);
    for (const [a, rol] of Object.entries({ cliente: 'Cliente', ajeno: 'Cliente', tercero: 'Cliente', personal: 'Personal', organizador: 'Organizador', admin: 'Administrador' })) {
      const id = randomUUID(), email = `${f.codigo}-${a}@example.test`.toLowerCase();
      await db.ds.transaction(async m => {
        await m.query("INSERT INTO identidad.usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,$2,$3,$4,'ACTIVA',now())", [id, f.codigo + ' ' + a, email, hash]);
        await m.query('INSERT INTO identidad.usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM identidad.roles WHERE nombre=$2', [id, rol]);
      });
      f.actores[a] = { id, email, rol }; c.guardar('fixture.json', f);
    }
    const r = await c.peticion('/api/v1/sesiones', { metodo: 'POST', cuerpo: { email: f.actores.organizador.email, contrasena: f.clave } }); c.assert.equal(r.estado, 200);
    async function alta(ruta, cuerpo) {
      const x = await c.peticion('/api/v1' + ruta, { metodo: 'POST', token: r.datos.token, cuerpo }); c.assert.equal(x.estado, 201, ruta); return x.datos;
    }
    const recinto = await alta('/recintos', { nombre: f.codigo, ciudad: 'Bogotá', direccion: 'Ensayo exclusivo', capacidad: 1000, zonas: [] });
    let e = (await alta('/eventos', { nombre: f.codigo, categoria: 'Ensayo seguridad', recintoId: recinto.recinto.id,
      fechaInicio: new Date(Date.now() + 30 * 86400000).toISOString(), fechaFin: new Date(Date.now() + 30 * 86400000 + 3600000).toISOString(),
      aforoMaximo: 1000, permiteReventa: true, localidades: [{ nombre: 'General', precio: 1000, cantidad: 1000 }] })).evento;
    f.evento = e.id; c.guardar('fixture.json', f);
    const publicado = await c.peticion('/api/v1/eventos/' + e.id + '/publicar', { metodo: 'POST', token: r.datos.token, cuerpo: { version: e.version } }); c.assert.equal(publicado.estado, 200);
    const limite = Date.now() + 10000; let localidades;
    do {
      localidades = await db.ds.query('SELECT l.localidad_id FROM entradas_ventas.localidades_evento l JOIN entradas_postventa.eventos_referencia p USING(evento_id) WHERE l.evento_id=$1 AND p.permite_reventa=true', [f.evento]);
      if (localidades.length) break;
      await new Promise(r => setTimeout(r, 100));
    } while (Date.now() < limite);
    c.assert.equal(localidades.length, 1, 'Proyecciones listas antes de comprar');
    f.localidad = localidades[0].localidad_id; f.estado = 'COMPLETA'; c.guardar('fixture.json', f);
    console.log('Fixture completa: seis cuentas nuevas y evento/localidad propios; proveedores simulados.');
  } finally { await db.cerrar(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
