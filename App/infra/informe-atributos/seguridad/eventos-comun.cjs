const { createHash, randomUUID } = require('node:crypto');
const c = require('./parqueaderos-comun.cjs');
const pngA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==', 'base64');
const pngB = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const hash = b => createHash('sha256').update(b).digest('hex');
async function http(ruta, { servidor = c.base, metodo = 'GET', token, cuerpo, archivo, campos = {}, cabeceras = {} } = {}) {
  c.assert([c.base, 'http://127.0.0.1:13149'].includes(servidor)); c.assert(/^\/(eventos|recintos)(?:\/|\?|$)/.test(ruta));
  let body;
  const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...cabeceras };
  if (archivo) {
    body = new FormData(); body.set('plano', new Blob([archivo], { type: 'image/png' }), 'plano-ensayo.png');
    for (const [k, v] of Object.entries(campos)) body.set(k, v);
  } else if (cuerpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(cuerpo); }
  const r = await fetch(servidor + '/api/v1' + ruta, { method: metodo, headers, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const bytes = Buffer.from(await r.arrayBuffer()), tipo = r.headers.get('content-type') ?? '';
  let datos = null; if (tipo.includes('json') && bytes.length) datos = JSON.parse(bytes.toString());
  return { estado: r.status, datos, bytes, hash: hash(bytes), tipo, cabeceras: Object.fromEntries(r.headers) };
}
const nombre = () => 'SEG-E-' + randomUUID().slice(0, 8);
const recinto = () => ({ nombre: nombre(), ciudad: 'Bogotá', direccion: 'Ensayo exclusivo', capacidad: 100,
  zonas: [{ nombre: 'General', capacidad: 60 }, { nombre: 'VIP', capacidad: 40 }] });
function evento(r, dias = 30) {
  const inicio = Date.now() + dias * 86400000;
  return { nombre: nombre(), categoria: 'Ensayo seguridad', recintoId: r.id, fechaInicio: new Date(inicio).toISOString(),
    fechaFin: new Date(inicio + 3600000).toISOString(), aforoMaximo: 100, permiteReventa: false,
    localidades: [{ nombre: 'General', precio: 1000, cantidad: 20, zonaRecintoId: r.zonas[0].id }] };
}
function editar(e) {
  return { nombre: e.nombre, categoria: e.categoria, recintoId: e.recintoId, fechaInicio: e.fechaInicio, fechaFin: e.fechaFin,
    aforoMaximo: e.aforoMaximo, permiteReventa: e.permiteReventa, version: e.version,
    localidades: e.localidades.map(l => ({ id: l.id, nombre: l.nombre, precio: Number(l.precio), cantidad: l.cantidad, ...(l.zonaRecintoId ? { zonaRecintoId: l.zonaRecintoId } : {}) })) };
}
async function capturador(db) {
  const tablas = await db.ds.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) AND tablename NOT IN ('migraciones','migrations') ORDER BY schemaname,tablename", [['identidad','alimentos','personal_logistica','entradas_ventas','entradas_catalogo','entradas_postventa','entradas_acceso_qr','finanzas_pagos','eventos_recintos','operacion','parqueaderos']]);
  const q = n => { c.assert(/^[a-z_0-9]+$/.test(n)); return '"' + n + '"'; };
  const sql = tablas.map(t => {
    const omitir = t.schemaname === 'eventos_recintos' && t.tablename === 'eventos_salientes' ? " - 'publicado_en'" : '';
    return `SELECT '${t.schemaname}.${t.tablename}' AS tabla,coalesce(jsonb_agg(fila ORDER BY fila::text),'[]'::jsonb) filas FROM (SELECT to_jsonb(t)${omitir} fila FROM ${q(t.schemaname)}.${q(t.tablename)} t) s`;
  }).join(' UNION ALL ');
  return async () => {
    // UNION ALL puede usar Parallel Append: comparar por tabla, no por el
    // orden de llegada. El contenido de cada tabla ya está ordenado en SQL.
    const filas = (await db.ds.query(sql)).sort((a, b) => a.tabla.localeCompare(b.tabla));
    const planos = await db.ds.query('SELECT recinto_id,tipo,tamano,actualizado_en,contenido FROM eventos_recintos.planos_recinto ORDER BY recinto_id');
    const secuencias = await db.ds.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='eventos_recintos' ORDER BY sequencename");
    const claves = []; let cursor = '0';
    do { const r = await db.redis.scan(cursor); cursor = r[0]; claves.push(...r[1]); } while (cursor !== '0');
    const redis = [];
    for (const k of claves.sort()) redis.push({ clave: k, tipo: await db.redis.type(k), valor: await db.redis.dump(k), expiraEn: await db.redis.call('PEXPIRETIME', k) });
    return JSON.parse(JSON.stringify({ filas, planos: planos.map(({ contenido, ...p }) => ({ ...p, sha256: hash(contenido) })), secuencias, redis }));
  };
}
module.exports = { ...c, pngA, pngB, hash, http, nombre, recinto, evento, editar, capturador };
