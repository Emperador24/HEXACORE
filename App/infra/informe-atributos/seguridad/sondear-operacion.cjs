// Solo reproducción anterior, sesiones/recursos nuevos; no activa evacuaciones ni canales.
const c = require('./operacion-comun.cjs');
async function main() {
  const m = c.guarda(); c.assert(!c.fs.existsSync(c.path.join(c.privado(), 'operacion-sse-antes.json')));
  const salida = { imagen: m.imagen, base: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pruebas: [], estado: 'EN_CURSO' };
  try {
    for (const [canal, servidor] of [['gateway', c.base], ['nucleo', 'http://127.0.0.1:13149']]) {
      const otro = await c.sesion('otroOrganizador', servidor);
      for (const tipo of ['evacuacion', 'panel']) {
        const s = await c.sesion('organizador', servidor), e = await c.escenario(servidor, otro.token);
        const propuesta = tipo === 'evacuacion' ? await c.proponer(servidor, otro.token, e) : null;
        const ruta = tipo === 'evacuacion' ? '/emergencias/evacuaciones/' + propuesta.evacuacion.id + '/flujo' : '/monitoreo/eventos/' + e.evento.id + '/flujo';
        const flujo = await c.abrir(servidor, ruta, s.token);
        try {
          c.assert.equal(flujo.estado, 200); const primero = await flujo.siguiente(); c.assert.equal(primero.tipo, tipo);
          const rev = await c.peticion('/api/v1/sesiones/actual', { servidor, metodo: 'DELETE', token: s.token }); c.assert.equal(rev.estado, 200);
          const revocadaUTC = new Date().toISOString(), desde = performance.now() - flujo.inicio;
          const cambio = tipo === 'evacuacion'
            ? await c.http(servidor, 'POST', '/emergencias/evacuaciones/' + propuesta.evacuacion.id + '/nivel', otro.token, { nivel: 2, motivo: 'Dato nuevo después de revocar', zonasIds: [e.recinto.zonas[1].id] })
            : await c.http(servidor, 'POST', '/monitoreo/eventos/' + e.evento.id + '/decisiones', otro.token, { tipo: 'OTRA', descripcion: 'Dato nuevo después de revocar' });
          c.assert.equal(cambio.estado, 201);
          const siguiente = await flujo.siguiente(); c.assert.equal(siguiente.tipo, tipo);
          c.assert(Date.parse(siguiente.datos.actualizadoEn) > Date.parse(revocadaUTC));
          c.assert(tipo === 'evacuacion' ? siguiente.datos.evacuacion.nivel === 2 : siguiente.datos.decisiones.some(x => x.id === cambio.datos.id));
          const nueva = await c.abrir(servidor, ruta, s.token); c.assert.equal(nueva.estado, 401); await nueva.cerrar();
          salida.pruebas.push({ canal, tipo, datoNuevoTrasRevocar: true, msTrasRevocar: siguiente.ms - desde, nuevaConexion: 401, revocadaUTC, frames: flujo.frames });
        } finally { await flujo.cerrar(); }
      }
    }
    salida.estado = 'REPRODUCIDO';
  } catch (e) { salida.estado = 'FALLIDO'; salida.error = e.message; process.exitCode = 1; }
  finally { c.guardar('operacion-sse-antes.json', salida); console.log(JSON.stringify({ estado: salida.estado, pruebas: salida.pruebas.map(({ frames, ...x }) => x), error: salida.error })); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
