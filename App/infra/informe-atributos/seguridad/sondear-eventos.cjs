const { randomUUID } = require('node:crypto');
const c = require('./parqueaderos-comun.cjs'), p = require('./preparar-eventos.cjs');
async function main() {
  c.guarda(); c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'eventos-brechas-antes.json'))); const db = await c.conexion(), pruebas = [];
  try {
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const s = await p.sesion('organizador', servidor);
      async function alta(ruta, cuerpo) { const r = await c.peticion('/api/v1/' + ruta, { servidor, metodo: 'POST', token: s.token, cuerpo }); c.assert.equal(r.estado, 201); return r.datos; }
      const recinto = () => ({ nombre: 'SEG-PROBE-' + randomUUID().slice(0, 8), ciudad: 'Bogotá', capacidad: 100, zonas: [{ nombre: 'General', capacidad: 100 }] });
      const a = (await alta('recintos', recinto())).recinto;
      const zonaAntes = (await db.ds.query('SELECT * FROM eventos_recintos.zonas_recinto WHERE id=$1', [a.zonas[0].id]))[0];
      const b = (await alta('recintos', { ...recinto(), zonas: [{ id: a.zonas[0].id, nombre: 'General', capacidad: 100 }] })).recinto;
      const zonaDespues = (await db.ds.query('SELECT * FROM eventos_recintos.zonas_recinto WHERE id=$1', [a.zonas[0].id]))[0];
      c.assert.equal(zonaDespues.recinto_id, b.id); c.assert.equal(b.zonas[0].id, a.zonas[0].id);
      const datos = { nombre: 'SEG-PROBE-' + randomUUID().slice(0, 8), categoria: 'Ensayo propio', recintoId: b.id, aforoMaximo: 100,
        fechaInicio: new Date(Date.now() + 30 * 86400000).toISOString(), fechaFin: new Date(Date.now() + 30 * 86400000 + 3600000).toISOString(),
        localidades: [{ nombre: 'General', cantidad: 50, precio: 1000, zonaRecintoId: b.zonas[0].id }] };
      const ea = (await alta('eventos', datos)).evento, localidadAntes = (await db.ds.query('SELECT * FROM eventos_recintos.localidades WHERE id=$1', [ea.localidades[0].id]))[0];
      const eb = (await alta('eventos', { ...datos, nombre: 'SEG-PROBE-' + randomUUID().slice(0, 8), localidades: [{ ...datos.localidades[0], id: ea.localidades[0].id }] })).evento;
      const localidadDespues = (await db.ds.query('SELECT * FROM eventos_recintos.localidades WHERE id=$1', [ea.localidades[0].id]))[0];
      c.assert.equal(localidadDespues.evento_id, eb.id); c.assert.equal(eb.localidades[0].id, ea.localidades[0].id);
      pruebas.push({ canal, zonaAntes, zonaDespues, localidadAntes, localidadDespues, demostracion: { zonaReasignadaAlCrearRecinto: true, localidadReasignadaAlCrearEvento: true, cuerposDtoValidos: true, controlesPositivos: 4 } });
    }
    c.guardar('eventos-brechas-antes.json', pruebas); console.log(JSON.stringify(pruebas.map(x => ({ canal: x.canal, ...x.demostracion }))));
  } finally { await db.cerrar(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
