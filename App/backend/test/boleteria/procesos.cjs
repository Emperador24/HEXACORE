const { spawn, spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const Redis = require('ioredis');
const raiz = resolve(__dirname, '../../../..'),
  cwd = resolve(raiz, 'App/backend');
const nombres = [
  'ventas',
  'catalogo',
  'cola-virtual',
  'postventa',
  'acceso-qr',
];
const bases = {
  ventas: 'entradas_e2e',
  catalogo: 'catalogo_boleteria_e2e',
  postventa: 'postventa_boleteria_e2e',
  'acceso-qr': 'acceso_qr_boleteria_e2e',
};
const puertos = Object.fromEntries(nombres.map((n) => [n, 13096]));
const entorno = () => ({
  ...process.env,
  NODE_ENV: 'test',
  PUERTO: '13096',
  PREFIJO_API: 'api/v1',
  POSTGRES_HOST: '127.0.0.1',
  POSTGRES_PUERTO: '15435',
  POSTGRES_USUARIO: 'cu011_e2e',
  POSTGRES_CONTRASENA: 'cu011_e2e',
  POSTGRES_BASE: 'entradas_e2e',
  POSTGRES_BD_VENTAS: bases.ventas,
  POSTGRES_BD_CATALOGO: bases.catalogo,
  POSTGRES_BD_POSTVENTA: bases.postventa,
  POSTGRES_BD_ACCESO_QR: bases['acceso-qr'],
  REDIS_HOST: '127.0.0.1',
  REDIS_PUERTO: '16382',
  RABBITMQ_URL: 'amqp://cu011_e2e:cu011_e2e@127.0.0.1:15675/cu011',
  POSTGRES_BD_PAGOS: 'pagos_e2e',
  PAGOS_PROVEEDOR_URL: 'http://127.0.0.1:13101',
  PASARELA_TIMEOUT_MS: '3000',
  VENTAS_URL: 'http://127.0.0.1:9/servidor-retirado',
  AUTH_JWT_EMISOR: 'hexacore-administracion',
  AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: resolve(
    __dirname,
    '../claves/jwt-publica.pem',
  ),
  TOKEN_SERVICIOS: 'boleteria-e2e-servicios',
  COMPRA_RESERVA_MINUTOS: '2',
  RESERVAS_CRON: '*/1 * * * * *',
  EXPIRACION_CRON: '*/1 * * * * *',
});
async function esperar(accion, limite = 15000) {
  const fin = Date.now() + limite;
  while (!(await accion())) {
    if (Date.now() > fin) throw Error('Condición de integración no alcanzada');
    await new Promise((r) => setTimeout(r, 50));
  }
}
async function metricasRabbit() {
  const headers = {
    Authorization: `Basic ${Buffer.from('cu011_e2e:cu011_e2e').toString('base64')}`,
  };
  const leer = async (ruta) => {
    const r = await fetch('http://127.0.0.1:16775/api/' + ruta, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const conexiones = (await leer('connections')).filter(
    (c) => c.client_properties.connection_name === 'hexacore-boleteria',
  );
  const nombres = new Set(conexiones.map(c => c.name));
  const consumidores = (await leer('consumers/cu011')).filter(c => nombres.has(c.channel_details.connection_name)).length;
  return { conexiones: conexiones.length, consumidores };
}
async function iniciar() {
  assert.equal(process.version, 'v22.22.3');
  const env = entorno();
  for (const nombre of Object.keys(bases)) {
    const r = spawnSync(
      process.execPath,
      [
        'node_modules/typeorm/cli.js',
        'migration:run',
        '-d',
        `dist/modulos/entradas/${nombre}/persistencia/data-source.js`,
      ],
      { cwd, env, encoding: 'utf8' },
    );
    assert.equal(r.status, 0, `Migración ${nombre}: ${r.stdout}\n${r.stderr}`);
  }
  const auxiliar = await require('../proceso-nucleo.cjs').iniciar();
  const hijo = spawn(process.execPath, ['dist/apps/boleteria/main.js'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const p = {
    nombre: 'boleteria',
    hijo,
    salida: '',
    url: 'http://127.0.0.1:13096',
  };
  hijo.stdout.on('data', (d) => (p.salida += d));
  hijo.stderr.on('data', (d) => (p.salida += d));
  mkdirSync(resolve(cwd, '.evidencia-e2e'), { recursive: true });
  writeFileSync(resolve(cwd, '.evidencia-e2e/boleteria.pid'), String(hijo.pid));
  const app = {
    procesos: [p], auxiliar,
    urls: Object.fromEntries(nombres.map((n) => [n, p.url])),
  };
  try {
    await esperar(async () => {
      if (hijo.exitCode !== null || hijo.signalCode !== null)
        throw Error(p.salida);
      let r;
      try {
        r = await fetch(p.url + '/api/v1/salud', {
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        return false;
      }
      if (!r.ok) return false;
      const h = await r.json();
      assert.equal(h.servicio, 'boleteria');
      assert.equal(h.pid, hijo.pid);
      assert.equal(
        JSON.stringify(h.trabajos.cron),
        JSON.stringify(['expirar-publicaciones', 'venta-expirar-reservas']),
      );
      return true;
    });
    await esperar(async () => {
      const m = await metricasRabbit();
      return m.conexiones === 1 && m.consumidores === 5;
    });
    return app;
  } catch (e) {
    try {
      await cerrar(app);
    } catch (cierre) {
      console.error(cierre.message);
    }
    throw e;
  }
}
async function cerrar(app) {
  if (app.cerrada) return;
  app.cerrada = true;
  try {
    for (const p of app.procesos) {
      assert.equal(p.hijo.exitCode, null, 'El proceso ya había terminado');
      assert.equal(p.hijo.signalCode, null);
      let forzado = false;
      const salida = new Promise((r) => p.hijo.once('exit', r));
      const timer = setTimeout(() => {
        forzado = true;
        p.hijo.kill('SIGKILL');
      }, 5000);
      p.hijo.kill('SIGTERM');
      await salida;
      clearTimeout(timer);
      assert.equal(forzado, false);
      assert.ok(p.hijo.signalCode === 'SIGTERM' || p.hijo.exitCode === 0);
      for (const marca of [
        'Consumos AMQP detenidos; pendientes=0',
        'Outbox Ventas detenido',
        'Outbox Acceso QR detenido',
        'Cron reservas detenido',
        'Cron publicaciones detenido',
      ])
        assert.ok(p.salida.includes(marca), marca);
      assert.doesNotMatch(
        p.salida,
        /UnknownElementException|Cierre de RabbitMQ con incidencias|Query read timeout|EXPIRACION_RESERVAS_FALLIDA/,
      );
    }
    const db = new Client({
      host: '127.0.0.1',
      port: 15435,
      user: 'cu011_e2e',
      password: 'cu011_e2e',
      database: 'postgres',
    });
    try {
      await db.connect();
      const r = await db.query(
        "SELECT application_name,datname FROM pg_stat_activity WHERE application_name LIKE 'boleteria-%' OR application_name='finanzas-pagos:boleteria'",
      );
      assert.equal(r.rowCount, 0);
    } finally {
      await db.end();
    }
    await esperar(async () => {
      const m = await metricasRabbit();
      return m.conexiones === 0 && m.consumidores === 0;
    });
    const redis = new Redis({ host: '127.0.0.1', port: 16382 });
    try {
      assert.doesNotMatch(await redis.client('LIST'), /name=boleteria /);
    } finally {
      redis.disconnect();
    }
    await assert.rejects(
      fetch(app.procesos[0].url + '/api/v1/salud', {
        signal: AbortSignal.timeout(1000),
      }),
    );
  } finally {
    for (const p of app.procesos)
      writeFileSync(resolve(cwd, '.evidencia-e2e/boleteria.log'), p.salida);
    rmSync(resolve(cwd, '.evidencia-e2e/boleteria.pid'), { force: true });
    if (app.auxiliar) await require('../proceso-nucleo.cjs').cerrar(app.auxiliar);
  }
}
module.exports = { iniciar, cerrar, entorno, bases, puertos, esperar, raiz, metricasRabbit };
