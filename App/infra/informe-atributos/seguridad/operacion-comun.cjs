const { createSign } = require('node:crypto');
const c = require('./eventos-comun.cjs'), p = require('./preparar-operacion.cjs');
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function http(servidor, metodo, ruta, token, cuerpo, cabeceras) {
  c.assert(/^\/(emergencias|monitoreo|eventos|recintos|parqueaderos|admin\/roles)(?:\/|\?|$)/.test(ruta));
  return c.peticion('/api/v1' + ruta, { servidor, metodo, token, cuerpo, cabeceras });
}
async function escenario(servidor, token) {
  const recinto = (await http(servidor, 'POST', '/recintos', token, c.recinto())); c.assert.equal(recinto.estado, 201);
  const r = recinto.datos.recinto, dto = c.evento(r, 1);
  dto.aforoMaximo = 2; dto.localidades[0].cantidad = 1;
  const alta = await http(servidor, 'POST', '/eventos', token, dto); c.assert.equal(alta.estado, 201);
  const evento = alta.datos.evento;
  const publicar = await http(servidor, 'POST', '/eventos/' + evento.id + '/publicar', token, { version: evento.version }); c.assert.equal(publicar.estado, 200);
  const plan = { salidas: [{ nombre: 'Norte', capacidadPorMinuto: 100 }, { nombre: 'Sur', capacidadPorMinuto: 100 }],
    rutas: r.zonas.flatMap(z => [{ zonaId: z.id, salida: 'Norte', prioridad: 1 }, { zonaId: z.id, salida: 'Sur', prioridad: 2 }]) };
  const x = await http(servidor, 'PUT', '/emergencias/recintos/' + r.id + '/plan', token, plan); c.assert.equal(x.estado, 200);
  return { recinto: r, evento, plan, salidas: x.datos.salidas, propuesta: { tipo: 'PREVENTIVA', ubicacion: 'Ensayo exclusivo', nivel: 1, alcance: 'PARCIAL', zonaOrigenId: r.zonas[0].id } };
}
async function proponer(servidor, token, e) {
  const x = await http(servidor, 'POST', '/emergencias/eventos/' + e.evento.id + '/evacuaciones', token, e.propuesta); c.assert.equal(x.estado, 201); return x.datos;
}
async function avisosEstables(db) {
  const limite = performance.now() + 3000;
  for (;;) {
    const [{ n }] = await db.ds.query(`SELECT (
      (SELECT count(*) FROM operacion.notificaciones_evacuacion WHERE publicada_en IS NULL OR entregada_en IS NULL) +
      (SELECT count(*) FROM eventos_recintos.eventos_salientes WHERE publicado_en IS NULL)
    )::int n`);
    if (n === 0) return;
    c.assert(performance.now() < limite, 'Precondición de avisos/acuse de Eventos no estable; conservar fallo, sin repetir operación'); await esperar(25);
  }
}
async function capturador(db) {
  const esquemas = ['identidad','alimentos','personal_logistica','entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr','finanzas_pagos','eventos_recintos','operacion','parqueaderos'];
  const tablas = await db.ds.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) AND tablename NOT IN ('migraciones','migrations') ORDER BY schemaname,tablename", [esquemas]);
  const q = n => { c.assert(/^[a-z_0-9]+$/.test(n)); return '"' + n + '"'; };
  const sql = tablas.map(t => `SELECT '${t.schemaname}.${t.tablename}' tabla,coalesce(jsonb_agg(fila ORDER BY fila::text),'[]'::jsonb) filas FROM (SELECT to_jsonb(t) fila FROM ${q(t.schemaname)}.${q(t.tablename)} t) s`).join(' UNION ALL ');
  // Una lectura atómica en Redis exclusivo evita que TYPE/DUMP/PEXPIRETIME
  // describan instantes distintos cuando una clave caduca. DUMP es binario.
  const lua = `local inicio=redis.call('TIME');local cursor='0';local claves={};local filas={};repeat
    local pagina=redis.call('SCAN',cursor,'COUNT',1000);cursor=pagina[1];for _,k in ipairs(pagina[2]) do claves[k]=true end
    until cursor=='0';for k,_ in pairs(claves) do local v=redis.call('DUMP',k);if v then
    table.insert(filas,{k,redis.call('TYPE',k).ok,v,redis.call('PEXPIRETIME',k)}) end end
    return {inicio,filas,redis.call('TIME')}`;
  const ms = t => Number(t[0].toString()) * 1000 + Number(t[1].toString()) / 1000;
  return async () => {
    await avisosEstables(db);
    const filas = (await db.ds.query(sql)).sort((a,b) => a.tabla.localeCompare(b.tabla));
    const planos = (await db.ds.query('SELECT recinto_id,tipo,tamano,actualizado_en,contenido FROM eventos_recintos.planos_recinto ORDER BY recinto_id')).map(({contenido,...x}) => ({...x,sha256:c.hash(contenido)}));
    const secuencias = await db.ds.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='eventos_recintos' ORDER BY sequencename");
    const outboxEventosCompleta = await db.ds.query('SELECT * FROM eventos_recintos.eventos_salientes ORDER BY secuencia');
    const [inicio, valores, fin] = await db.redis.evalBuffer(lua, 0);
    const redis = valores.map(([clave,tipo,valor,expiraEn]) => ({clave:clave.toString(),tipo:tipo.toString(),valor:valor.toString('base64'),expiraEn})).sort((a,b) => a.clave.localeCompare(b.clave));
    return JSON.parse(JSON.stringify({filas,planos,secuencias,outboxEventosCompleta,redis,relojRedis:{inicioMs:ms(inicio),finMs:ms(fin)}}));
  };
}
function comparar(antes, despues) {
  c.assert(antes.relojRedis.finMs <= despues.relojRedis.finMs, 'Reloj Redis no retrocede');
  const actuales = new Map(despues.redis.map(x => [x.clave, x]));
  const expiradas = antes.redis.filter(x => !actuales.has(x.clave) && x.expiraEn > 0
    && x.expiraEn >= antes.relojRedis.inicioMs && x.expiraEn <= despues.relojRedis.finMs);
  const naturales = new Set(expiradas.map(x => x.clave));
  const { relojRedis: relojAntes, ...a } = antes, { relojRedis: relojDespues, ...b } = despues;
  // Solo la desaparición al vencer el TTL es esperable. Valores, TTL futuros,
  // claves nuevas, borrados anticipados y todas las tablas siguen siendo estrictos.
  c.assert.deepEqual(b, { ...a, redis: a.redis.filter(x => !naturales.has(x.clave)) });
  return expiradas.map(x => ({ clave: x.clave, expiraEn: x.expiraEn, observadaHastaMs: relojDespues.finMs }));
}
async function abrir(servidor, ruta, token) {
  c.assert([c.base, 'http://127.0.0.1:13149'].includes(servidor));
  c.assert(/^\/(emergencias\/evacuaciones\/[^/]+\/flujo|monitoreo\/eventos\/[^/]+\/flujo|parqueaderos\/eventos\/[^/]+\/ocupacion\/flujo)$/.test(ruta));
  const control = new AbortController(), inicio = performance.now(), frames = []; let lector, buffer = '', fin;
  const plazo = setTimeout(() => control.abort(), 10000), decoder = new TextDecoder();
  try {
    const r = await fetch(servidor + '/api/v1' + ruta, { headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), Accept: 'text/event-stream' }, signal: control.signal });
    if (r.status !== 200) { clearTimeout(plazo); return { estado: r.status, cuerpo: await r.json(), async cerrar() { control.abort(); } }; }
    lector = r.body.getReader();
    async function siguiente() {
      for (;;) {
        const i = buffer.indexOf('\n\n');
        if (i >= 0) { const b = buffer.slice(0, i); buffer = buffer.slice(i + 2); const tipo = /^event: (.+)$/m.exec(b)?.[1];
          const datos = b.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
          if (tipo && datos) { const f = { tipo, datos: JSON.parse(datos), ms: performance.now() - inicio, recibidoUTC: new Date().toISOString() }; frames.push(f); return f; } continue; }
        const r = await lector.read(); if (r.done) { fin = performance.now() - inicio; clearTimeout(plazo); return null; }
        buffer += decoder.decode(r.value, { stream: true }).replaceAll('\r\n', '\n');
      }
    }
    return { estado: r.status, inicio, frames, siguiente, get fin() { return fin; }, async hastaCierre() { while (await siguiente()); },
      async cerrar() { clearTimeout(plazo); control.abort(); await lector.cancel().catch(() => {}); lector.releaseLock(); } };
  } catch (e) { clearTimeout(plazo); control.abort(); throw e; }
}
function tokenCorto(token, meta) {
  const [cabecera, carga] = token.split('.'), payload = JSON.parse(Buffer.from(carga, 'base64url')); payload.exp = Math.floor(Date.now() / 1000) + 5;
  const texto = cabecera + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
  const clave = c.fs.readFileSync(meta.montajes.find(x => x.Destination === '/claves/jwt-privada.pem').Source);
  return { token: texto + '.' + createSign('RSA-SHA256').update(texto).sign(clave, 'base64url'), exp: payload.exp * 1000 };
}
module.exports = { ...c, http, escenario, proponer, avisosEstables, capturador, comparar, abrir, tokenCorto, esperar, sesion: p.sesion };
