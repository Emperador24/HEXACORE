// Solo lectura, sin bootstrap Nest, semillas, migraciones, consumidores o cron.
const fs = require('node:fs');
const http = require('node:http');
const { Client } = require('/app/node_modules/pg');
const Redis = require('/app/node_modules/ioredis');
const amqp = require('/app/node_modules/amqplib');
const salida = {};
const limite = setTimeout(() => { console.log(JSON.stringify({ ...salida, limite: true })); process.exit(1); }, 15000);
async function comprobar(nombre, fn) {
  try { await fn(); salida[nombre] = 'arriba'; }
  catch { salida[nombre] = 'caido'; } // No imprimir URI, clave ni mensajes del driver.
}
function salud(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url + '/salud', { timeout: 3000 }, r => {
      r.resume(); r.on('end', () => r.statusCode === 200 ? resolve() : reject());
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
  });
}
(async () => {
  const e = process.env;
  await comprobar('postgres', async () => {
    const c = new Client({ host:e.POSTGRES_HOST, port:Number(e.POSTGRES_PUERTO),
      user:e.POSTGRES_USUARIO, password:e.POSTGRES_CONTRASENA, database:e.POSTGRES_BD,
      connectionTimeoutMillis:3000, query_timeout:3000 });
    try {
      await c.connect();
      const r = await c.query('SELECT current_database() AS base');
      if (r.rows[0].base !== e.POSTGRES_BD) throw new Error('destino');
      const marca=await c.query("SELECT demo,fuente,estado FROM migracion_control.demo_zerotier WHERE id");
      if(marca.rowCount!==1 || marca.rows[0].estado!=='LISTA' || marca.rows[0].demo!==e.DEMO_ID || marca.rows[0].fuente!==e.DEMO_FUENTE)throw new Error('preparacion no terminada o version distinta');
      for (const h of JSON.parse(fs.readFileSync('/demo/historial.json','utf8'))) {
        if (!/^[a-z_]+$/.test(h.esquema) || !/^[a-z_]+$/.test(h.historial)) throw new Error('identificador');
        const r = await c.query(`SELECT count(*)::int AS n FROM "${h.esquema}"."${h.historial}"`);
        if (r.rows[0].n !== h.cantidad) throw new Error('preparacion');
      }
    } finally { await c.end(); }
  });
  await comprobar('redis', async () => {
    const c = new Redis({ host:e.REDIS_HOST, port:Number(e.REDIS_PUERTO), lazyConnect:true,
      enableOfflineQueue:false, retryStrategy:()=>null, maxRetriesPerRequest:0, connectTimeout:3000, commandTimeout:3000 });
    c.on('error',()=>{});
    try { await c.connect(); if (await c.ping() !== 'PONG') throw new Error('ping'); }
    finally { c.disconnect(); }
  });
  await comprobar('rabbitmq', async () => {
    const c = await amqp.connect(e.RABBITMQ_URL, { timeout:3000 }); await c.close();
  });
  await comprobar('correo', () => salud(e.CORREO_PROVEEDOR_URL));
  await comprobar('pasarela', () => salud(e.PAGOS_PROVEEDOR_URL));
  await comprobar('claves', async () => {
    fs.accessSync(e.AUTH_JWT_CLAVE_PUBLICA_ARCHIVO, fs.constants.R_OK);
    fs.accessSync(e.AUTH_JWT_CLAVE_PRIVADA_ARCHIVO, fs.constants.R_OK);
  });
  clearTimeout(limite); console.log(JSON.stringify(salida));
  process.exit(Object.values(salida).every(x=>x==='arriba') ? 0 : 1);
})().catch(()=>{ clearTimeout(limite); console.log(JSON.stringify({ error:'sonda' })); process.exit(1); });
