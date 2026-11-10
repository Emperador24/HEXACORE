const { base: basePruebas, opcionesPg } = require('./base-unica/conexiones.cjs');
const { spawn, spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const cwd = resolve(__dirname, '..');
const entorno = () => require('./base-unica/conexiones.cjs').entorno();
async function iniciar({ rabbitmqUrl, gestionUrl = 'http://127.0.0.1:16779' } = {}) {
    const env = entorno();
    if (rabbitmqUrl) env.RABBITMQ_URL = rabbitmqUrl;
    const urlRabbit = new URL(env.RABBITMQ_URL);
    const credenciales = decodeURIComponent(urlRabbit.username) + ':' + decodeURIComponent(urlRabbit.password);
    const respuesta = await fetch(gestionUrl + '/api/connections', { headers: { Authorization: 'Basic ' + Buffer.from(credenciales).toString('base64') } });
    assert.equal(respuesta.status, 200);
    assert.ok(!(await respuesta.json()).some(c => c.client_properties.connection_name === 'hexacore-nucleo'), 'Detener las imágenes de pruebas antes de ejecutar procesos compilados');
    const p = { hijo: spawn(process.execPath, ['dist/apps/nucleo/main.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }), salida: '' };
    p.hijo.stdout.on('data', d => p.salida += d);
    p.hijo.stderr.on('data', d => p.salida += d);
    try {
        const limite = Date.now() + 15000;
        while (true) {
            if (p.hijo.exitCode !== null || p.hijo.signalCode !== null)
                throw Error(p.salida);
            let r;
            try {
                r = await fetch('http://127.0.0.1:13087/api/v1/salud', { signal: AbortSignal.timeout(1000) });
            }
            catch { }
            if (r?.ok && p.salida.includes('7 topologías declaradas'))
                break;
            if (Date.now() > limite)
                throw Error('Núcleo auxiliar no disponible: ' + p.salida);
            await new Promise(r => setTimeout(r, 50));
        }
        return p;
    }
    catch (e) {
        await cerrar(p);
        throw e;
    }
}
async function cerrar(p) {
    try {
        if (p.hijo.exitCode === null && p.hijo.signalCode === null) {
            let forzado = false;
            const fin = new Promise(r => p.hijo.once('exit', r));
            const timer = setTimeout(() => { forzado = true; p.hijo.kill('SIGKILL'); }, 5000);
            p.hijo.kill('SIGTERM');
            await fin;
            clearTimeout(timer);
            assert.equal(forzado, false);
            assert.ok(p.hijo.signalCode === 'SIGTERM' || p.hijo.exitCode === 0);
            assert.ok(p.salida.includes('Consumos AMQP detenidos; pendientes=0'));
            assert.ok(p.salida.includes('Consumidor de logística detenido'));
            assert.ok(p.salida.includes('Sondeo de reservas detenido'));
        }
        const db = new Client(opcionesPg('pagos'));
        try {
            await db.connect();
            const r = await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name LIKE 'nucleo-%' OR application_name='finanzas-pagos:nucleo'");
            assert.equal(r.rows[0].n, 0);
        }
        finally {
            await db.end();
        }
    }
    finally {
        mkdirSync(resolve(cwd, '.evidencia-e2e'), { recursive: true });
        writeFileSync(resolve(cwd, '.evidencia-e2e/nucleo-boleteria.log'), p.salida);
    }
}
module.exports = { iniciar, cerrar, entorno };
