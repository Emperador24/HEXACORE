const { base: basePruebas, opcionesPg } = require('../base-unica/conexiones.cjs');
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
  ventas: basePruebas,
  catalogo: basePruebas,
  postventa: basePruebas,
  'acceso-qr': basePruebas,
};
const puertos = Object.fromEntries(nombres.map((n) => [n, 13096]));
const entorno = () => ({...require('../base-unica/conexiones.cjs').entorno(),PUERTO:'13096',VENTAS_URL:'http://127.0.0.1:9/retirado',TOKEN_SERVICIOS:'boleteria-e2e-servicios',COMPRA_RESERVA_MINUTOS:'2',RESERVAS_CRON:'*/1 * * * * *',EXPIRACION_CRON:'*/1 * * * * *'});
// Contratos de los cuatro propietarios; conserva duplicados al comparar con
// RabbitMQ para detectar consumidores extra al arrancar o reconectar.
const colasEsperadas = Object.freeze([
  'ventas.ingresos', 'ventas.notificaciones', 'ventas.eventos',
  'catalogo.eventos',
  'reventa.notificaciones', 'reventa.liquidaciones', 'postventa.eventos',
  'acceso-qr.entradas', 'acceso.eventos-gestion',
].sort());
// fetch puede devolver arrays de otro contexto de V8 al ejecutarse bajo Jest.
// Comparar los nombres primitivos, sin exigir identidad de prototipos.
const consumosListos = m => m.conexiones === 1 && Array.isArray(m.colas)
  && m.colas.length === colasEsperadas.length
  && m.colas.every((cola, i) => cola === colasEsperadas[i]);
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
    const r = await fetch('http://127.0.0.1:16779/api/' + ruta, {
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
  const colas = (await leer('consumers/cu011')).filter(c => nombres.has(c.channel_details.connection_name))
    .map(c => c.queue.name).sort();
  return { conexiones: conexiones.length, consumidores: colas.length, colas };
}
async function iniciar() {
  assert.equal(process.version, 'v22.22.3');
  const env = entorno();
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
    let observadas;
    try {
      await esperar(async () => {
        observadas = await metricasRabbit();
        return consumosListos(observadas);
      });
    } catch (error) {
      // Solo composición AMQP: nunca salida completa del proceso, mensajes,
      // credenciales, destinatarios ni datos de negocio en el log público.
      throw new Error(`Composición AMQP no converge: ${JSON.stringify({ esperadas: colasEsperadas, observadas })}`, { cause: error });
    }
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
      port: 15439,
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
    const redis = new Redis({ host: '127.0.0.1', port: 16384 });
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
module.exports = { iniciar, cerrar, entorno, bases, puertos, esperar, raiz, metricasRabbit, colasEsperadas, consumosListos };
