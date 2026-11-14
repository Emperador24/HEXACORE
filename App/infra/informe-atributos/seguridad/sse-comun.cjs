const c = require('./parqueaderos-comun.cjs');
async function abrir(servidor, evento, token) {
  const control = new AbortController(), inicio = performance.now();
  const plazo = setTimeout(() => control.abort(), 10000);
  let lector, buffer = ''; const frames = [], decoder = new TextDecoder(); let fin;
  try {
    const r = await fetch(servidor + '/api/v1/parqueaderos/eventos/' + evento + '/ocupacion/flujo', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'text/event-stream' }, signal: control.signal });
    if (r.status !== 200) { clearTimeout(plazo); return { estado: r.status, cuerpo: await r.json(), cerrar() { control.abort(); } }; }
    lector = r.body.getReader();
    async function siguiente() {
      for (;;) {
        const i = buffer.indexOf('\n\n');
        if (i >= 0) {
          const b = buffer.slice(0, i); buffer = buffer.slice(i + 2);
          const tipo = /^event: (.+)$/m.exec(b)?.[1], datos = b.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
          if (tipo && datos) { const f = { tipo, datos: JSON.parse(datos), ms: performance.now() - inicio, recibidoUTC: new Date().toISOString() }; frames.push(f); return f; }
          continue;
        }
        const r = await lector.read();
        if (r.done) { fin = performance.now() - inicio; clearTimeout(plazo); return null; }
        buffer += decoder.decode(r.value, { stream: true }).replaceAll('\r\n', '\n');
      }
    }
    return { estado: r.status, frames, inicio, siguiente, get fin() { return fin; }, async hastaCierre() { while (await siguiente()); return frames; },
      async cerrar() { clearTimeout(plazo); control.abort(); await lector.cancel().catch(() => {}); lector.releaseLock(); } };
  } catch (e) { clearTimeout(plazo); control.abort(); throw e; }
}
module.exports = { ...c, abrir };
