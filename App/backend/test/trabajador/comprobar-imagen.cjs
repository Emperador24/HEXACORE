const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const { connect } = require('amqplib');
const { rabbit, esperar, gestion } = require('./proceso.cjs');
const ref = require('./correos-referencia.json');
const compose = ['compose', '-p', 'hexacore-trabajador-e2e', '-f', resolve(__dirname, 'docker-compose.yml'), '--profile', 'imagen'];
const nombre = 'hexacore-trabajador-e2e-trabajador-1';
async function main() {
    assert.equal(process.version, 'v22.22.3');
    const c = JSON.parse(execFileSync('docker', ['inspect', nombre], { encoding: 'utf8' }))[0];
    const env = c.Config.Env.map(e => e.split('=')[0]);
    assert.ok(!env.some(k => /^(POSTGRES_|DB_|REDIS_|PAGOS_|AUTH_JWT_)/.test(k)));
    const ps = execFileSync('docker', [...compose, 'exec', '-T', 'trabajador', 'ps', '-o', 'pid,args'], { encoding: 'utf8' });
    assert.equal(ps.split('\n').filter(l => /^\s*\d+\s+node dist\/apps\/trabajador\/main\.js$/.test(l)).length, 1, ps);
    const salud = await fetch('http://127.0.0.1:13100/api/v1/salud');
    assert.equal(salud.status, 200);
    const h = await salud.json();
    assert.equal(h.servicio, 'notificaciones');
    assert.deepEqual(h.dependencias, { rabbitmq: 'arriba' });
    assert.equal((await fetch('http://127.0.0.1:13100/api/v1/cuentas/registro', { method: 'POST' })).status, 404);
    const amqp = await connect(rabbit), canal = await amqp.createConfirmChannel();
    const id = randomUUID(), email = `imagen-${id}@example.test`, e = { id, evento: 'CORREO_PENDIENTE', version: 1, tipo: 'VERIFICACION', ocurridoEn: new Date().toISOString(), destinatario: { nombre: 'Nora', email }, token: 'fixture-token' };
    try {
        assert.equal((await canal.checkQueue('cuentas.correos')).consumerCount, 1);
        execFileSync('docker', [...compose, 'stop', 'trabajador'], { encoding: 'utf8' });
        const estado = JSON.parse(execFileSync('docker', ['inspect', nombre], { encoding: 'utf8' }))[0].State;
        assert.ok([0, 143].includes(estado.ExitCode));
        assert.equal(estado.OOMKilled, false);
        assert.equal((await canal.checkQueue('cuentas.correos')).consumerCount, 0);
        await new Promise((r, j) => canal.publish('cuentas.eventos', 'cuenta.correo', Buffer.from(JSON.stringify(e)), { persistent: true, messageId: id }, err => err ? j(err) : r()));
        assert.equal((await canal.checkQueue('cuentas.correos')).messageCount, 1);
        execFileSync('docker', [...compose, 'up', '-d', '--no-deps', '--no-build', '--wait', 'trabajador'], { encoding: 'utf8' });
        const intentos = await esperar(async () => { const r = await fetch('http://127.0.0.1:13103/estado?para=' + encodeURIComponent(email)); assert.equal(r.status, 200); const a = (await r.json()).intentos; return a.length && a; });
        assert.equal(intentos.length, 1);
        assert.deepEqual(intentos[0].cuerpo, { ...ref.VERIFICACION, para: email });
        assert.equal((await canal.checkQueue('cuentas.correos')).consumerCount, 1);
        await esperar(async () => { const consumidores = (await gestion('consumers/trabajador_e2e')).filter(x => x.queue.name === 'cuentas.correos'); return consumidores.length === 1; });
        console.log('Imagen Trabajador: un Node/consumidor, salud compatible, sin SQL/Redis/JWT/Pagos; pendiente entregado tras SIGTERM/reinicio.');
    }
    finally {
        await canal.close();
        await amqp.close();
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
