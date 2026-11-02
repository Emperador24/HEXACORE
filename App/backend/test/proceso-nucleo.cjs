const { spawn, spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const cwd = resolve(__dirname, '..');
const entorno = () => ({ ...process.env,
    NODE_ENV: 'test', PUERTO: '13087', PREFIJO_API: 'api/v1',
    POSTGRES_HOST: '127.0.0.1', POSTGRES_PUERTO: '15435', POSTGRES_USUARIO: 'cu011_e2e', POSTGRES_CONTRASENA: 'cu011_e2e',
    POSTGRES_BD_ADMINISTRACION: 'identidad_cu011_e2e', POSTGRES_BD_PEDIDOS: 'alimentos_cu011_e2e', POSTGRES_BD_PAGOS: 'pagos_e2e', POSTGRES_MAX_CONEXIONES: '4',
    DB_HOST: '127.0.0.1', DB_PORT: '15435', DB_USER: 'cu011_e2e', DB_PASSWORD: 'cu011_e2e', DB_NAME: 'eventos_emergencias_nucleo_e2e', PREFIJO_COLAS: 'nucleo-e2e.',
    REDIS_HOST: '127.0.0.1', REDIS_PUERTO: '16382', RABBITMQ_URL: 'amqp://cu011_e2e:cu011_e2e@127.0.0.1:15675/cu011',
    PAGOS_PROVEEDOR_URL: 'http://127.0.0.1:13101', PASARELA_TIMEOUT_MS: '3000', PASARELA_SECRETO_WEBHOOK: 'backend-webhook-pruebas',
    AUTH_JWT_EMISOR: 'hexacore-administracion', AUTH_JWT_CLAVE_PUBLICA_ARCHIVO: resolve(__dirname, 'claves/jwt-publica.pem'), AUTH_JWT_CLAVE_PRIVADA_ARCHIVO: resolve(__dirname, 'claves/jwt-privada.pem'),
});
async function iniciar() {
    const env = entorno();
    const respuesta = await fetch('http://127.0.0.1:16775/api/connections', { headers: { Authorization: 'Basic ' + Buffer.from('cu011_e2e:cu011_e2e').toString('base64') } });
    assert.equal(respuesta.status, 200);
    assert.ok(!(await respuesta.json()).some(c => c.client_properties.connection_name === 'hexacore-nucleo'), 'Detener las imágenes de pruebas antes de ejecutar procesos compilados');
    for (const modulo of ['identidad', 'alimentos', 'personal-logistica']) {
        const r = spawnSync(process.execPath, ['node_modules/typeorm/cli.js', 'migration:run', '-d', `dist/modulos/${modulo}/persistencia/data-source.js`], { cwd, env, encoding: 'utf8' });
        assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
    }
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
            if (r?.ok && p.salida.includes('4 topologías declaradas'))
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
        const db = new Client({ host: '127.0.0.1', port: 15435, user: 'cu011_e2e', password: 'cu011_e2e', database: 'pagos_e2e' });
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
