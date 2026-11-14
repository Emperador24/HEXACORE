const c = require('./sse-comun.cjs'), p = require('./preparar-parqueaderos.cjs');
async function main() {
  c.guarda(); c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'sse-antes.json'))); const pruebas = [];
  for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
    const s = await p.iniciarSesion('organizador', servidor), otro = await p.iniciarSesion('otroOrganizador', servidor), evento = await p.evento(s.token, servidor);
    const flujo = await c.abrir(servidor, evento, s.token);
    try {
      c.assert.equal(flujo.estado, 200); const primero = await flujo.siguiente(); c.assert.equal(primero.datos.evento.id, evento);
      const r = await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: s.token }); c.assert.equal(r.estado, 200);
      const revocadaUTC = new Date().toISOString(), revocadaMs = performance.now() - flujo.inicio;
      const z = await c.peticion('/api/v1/parqueaderos/eventos/' + evento + '/zonas', { servidor, metodo: 'POST', token: otro.token, cuerpo: { nombre: 'Posterior a revocación', capacidad: 3, prefijo: 'R' } }); c.assert.equal(z.estado, 201);
      const siguiente = await flujo.siguiente(); c.assert.equal(siguiente.tipo, 'ocupacion'); c.assert.equal(siguiente.datos.total.capacidad, 3);
      c.assert(Date.parse(siguiente.datos.actualizadoEn) > Date.parse(revocadaUTC));
      const nueva = await c.abrir(servidor, evento, s.token); c.assert.equal(nueva.estado, 401); await nueva.cerrar();
      pruebas.push({ canal, evento, revocadaUTC, revocadaMs, datoPosteriorMs: siguiente.ms, datosNuevosTrasRevocar: true, nuevaConexion: nueva.estado, frames: flujo.frames });
    } finally { await flujo.cerrar(); }
  }
  c.guardar('sse-antes.json', pruebas); console.log(JSON.stringify(pruebas.map(x => ({ canal: x.canal, datosNuevosTrasRevocar: x.datosNuevosTrasRevocar, msPosterior: x.datoPosteriorMs - x.revocadaMs, nuevaConexion: x.nuevaConexion }))));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
