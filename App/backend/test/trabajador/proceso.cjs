const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const cwd = resolve(__dirname, '../..');
const rabbit = 'amqp://trabajador_e2e:trabajador_e2e@127.0.0.1:15677/trabajador_e2e';
async function esperar(accion, ms = 15000) {
    const fin = Date.now() + ms;
    while (true) {
        const r = await accion();
        if (r)
            return r;
        assert.ok(Date.now() < fin, 'Condición no cumplida antes del plazo');
        await new Promise(r => setTimeout(r, 50));
    }
}
async function gestion(ruta, method = 'GET') {
    const r = await fetch('http://127.0.0.1:16777/api/' + ruta, { method, headers: { Authorization: 'Basic ' + Buffer.from('trabajador_e2e:trabajador_e2e').toString('base64') }, signal: AbortSignal.timeout(3000) });
    assert.ok(r.ok, `${method} ${ruta}: ${r.status}`);
    return r.status === 204 ? null : r.json();
}
async function cola(canal) {
    const q = await gestion('queues/trabajador_e2e/cuentas.correos');
    // Los agregados de la cola llegan por muestreo y pueden tardar varios segundos.
    // La lista de consumidores permite observar la suscripción sin agotar envíos retenidos.
    const consumidores = (await gestion('consumers/trabajador_e2e')).filter(c => c.queue.name === 'cuentas.correos');
    const actual = canal ? await canal.checkQueue('cuentas.correos') : null;
    return { ...q, consumers: actual?.consumerCount ?? consumidores.length, messages_ready: actual?.messageCount ?? q.messages_ready, consumer_details: consumidores };
}
async function iniciar(puerto = 13098, cambio = {}) {
    mkdirSync(resolve(cwd, '.evidencia-e2e'), { recursive: true });
    const carga = resolve(cwd, `.evidencia-e2e/trabajador-carga-${puerto}.json`);
    const env = { ...process.env, NODE_ENV: 'test', PUERTO: String(puerto), PREFIJO_API: 'api/v1', RABBITMQ_URL: rabbit,
        CORREO_PROVEEDOR_URL: 'http://127.0.0.1:13103', CORREO_URL_BASE_ENLACES: 'https://portal.example.test/cuenta', AUTH_BLOQUEO_MINUTOS: '15',
        POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '9', POSTGRES_CONTRASENA: 'inutilizable', DB_PORT: '9', REDIS_PUERTO: '9',
        AUTH_JWT_CLAVE_PRIVADA_ARCHIVO: '/no-existe/privada.pem', AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: '/no-existe/publica.pem',
        PRUEBA_CARGA_ARCHIVO: carga, ...cambio };
    const p = { puerto, carga, salida: '', hijo: spawn(process.execPath, ['--require', resolve(__dirname, 'capturar-carga.cjs'), resolve(process.env.TRABAJADOR_ENTRADA || resolve(cwd, 'dist/apps/trabajador/main.js'))], { cwd: process.env.TRABAJADOR_CWD || cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }) };
    p.hijo.stdout.on('data', d => p.salida += d);
    p.hijo.stderr.on('data', d => p.salida += d);
    try {
        await esperar(async () => { assert.equal(p.hijo.exitCode, null, p.salida); try {
            const r = await fetch(`http://127.0.0.1:${puerto}/api/v1/salud`, { signal: AbortSignal.timeout(500) });
            return r.ok && p.salida.includes('Escuchando cuentas.correos');
        }
        catch {
            return false;
        } });
        return p;
    }
    catch (e) {
        await cerrar(p);
        throw e;
    }
}
async function cerrar(p) {
    if (!p)
        return;
    try {
        if (p.hijo.exitCode === null && p.hijo.signalCode === null) {
            let forzado = false;
            const fin = new Promise(r => p.hijo.once('exit', r));
            const timer = setTimeout(() => { forzado = true; p.hijo.kill('SIGKILL'); }, 5000);
            p.hijo.kill('SIGTERM');
            await fin;
            clearTimeout(timer);
            assert.equal(forzado, false, 'Cierre forzado');
        }
        assert.ok(p.hijo.exitCode === 0 || p.hijo.signalCode === 'SIGTERM', p.salida);
        const archivos = JSON.parse(readFileSync(p.carga, 'utf8'));
        assert.ok(!archivos.some(f => /node_modules\/(pg|typeorm|ioredis|@nestjs\/jwt)\/|modulos\/(finanzas|identidad)\//.test(f)), 'El consumidor carga dependencias de negocio ajenas');
    }
    finally {
        writeFileSync(resolve(cwd, `.evidencia-e2e/trabajador-${p.puerto}.log`), p.salida);
    }
}
module.exports = { iniciar, cerrar, gestion, cola, esperar, rabbit };
