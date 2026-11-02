const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { connect } = require('amqplib');
const nucleo = require('../proceso-nucleo.cjs');
const trabajador = require('./proceso.cjs');
const email = `identidad-${randomUUID()}@example.test`, contrasena = 'identidad correo aislado', nueva = 'otra frase para pruebas';
let core, worker, token, observador, canalObservador;
const datos = new Client({ host: '127.0.0.1', port: 15435, user: 'cu011_e2e', password: 'cu011_e2e', database: 'identidad_cu011_e2e' });
async function pedir(ruta, body, auth) {
    const r = await fetch('http://127.0.0.1:13087/api/v1/' + ruta, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return { status: r.status, body: await r.json() };
}
async function correo(asunto) {
    return trabajador.esperar(async () => { const r = await fetch('http://127.0.0.1:13103/estado?para=' + encodeURIComponent(email)); assert.equal(r.status, 200); return (await r.json()).intentos.find(i => i.aceptado && i.cuerpo.asunto === asunto)?.cuerpo; });
}
const enlace = c => new URL(c.texto.split('\n').find(t => t.startsWith('https://portal.example.test/'))).searchParams.get('token');
before(async () => {
    assert.equal(process.version, 'v22.22.3');
    core = await nucleo.iniciar({ rabbitmqUrl: trabajador.rabbit, gestionUrl: 'http://127.0.0.1:16777' });
    await datos.connect();
    observador = await connect(trabajador.rabbit);
    canalObservador = await observador.createChannel();
    assert.equal((await trabajador.cola(canalObservador)).consumers, 0, 'Detener la imagen Trabajador antes del recorrido por proceso');
});
after(async () => {
    try {
        await trabajador.cerrar(worker);
        await nucleo.cerrar(core);
        const amqp = await connect(trabajador.rabbit), canal = await amqp.createChannel();
        try {
            // Solo fixtures de esta corrida; no purgar una cola ni tocar otros mensajes.
            while (true) {
                const m = await canal.get('cuentas.correos', { noAck: false });
                if (!m)
                    break;
                if (JSON.parse(m.content).destinatario?.email === email)
                    canal.ack(m);
                else {
                    canal.nack(m, false, true);
                    break;
                }
            }
        }
        finally {
            await canal.close();
            await amqp.close();
        }
        await datos.query('DELETE FROM usuarios WHERE email=$1', [email]);
    }
    finally {
        await canalObservador?.close();
        await observador?.close();
        await datos.end();
    }
});
test('registro real con Trabajador detenido: mensaje persistente pendiente y entrega al volver', async () => {
    const r = await pedir('cuentas/registro', { nombre: 'Nora Prueba', email, contrasena });
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal((await trabajador.cola(canalObservador)).consumers, 0);
    const amqp = await connect(trabajador.rabbit), canal = await amqp.createChannel();
    try {
        const m = await trabajador.esperar(() => canal.get('cuentas.correos', { noAck: false }));
        const e = JSON.parse(m.content);
        assert.equal(e.destinatario.email, email);
        assert.equal(e.tipo, 'VERIFICACION');
        assert.equal(e.evento, 'CORREO_PENDIENTE');
        assert.equal(e.version, 1);
        assert.equal(m.properties.messageId, e.id);
        assert.equal(m.properties.deliveryMode, 2);
        assert.equal(m.properties.type, 'CORREO_PENDIENTE');
        canal.nack(m, false, true);
        await trabajador.esperar(async () => (await canal.checkQueue('cuentas.correos')).messageCount === 1);
        assert.equal((await canal.checkQueue('cuentas.correos')).messageCount, 1);
    }
    finally {
        await canal.close();
        await amqp.close();
    }
    worker = await trabajador.iniciar();
    const c = await correo('Verifica tu cuenta de HEXACORE');
    assert.match(c.texto, /Hola Nora Prueba/);
    const verificar = await pedir('cuentas/verificar', { token: enlace(c) });
    assert.equal(verificar.status, 200);
    const login = await pedir('sesiones', { email, contrasena });
    assert.equal(login.status, 200);
    token = login.body.token;
    assert.equal((await pedir('cuentas/perfil', undefined, token)).body.email, email);
});
test('registro duplicado y bloqueo real conservan los avisos publicados por Identidad', async () => {
    assert.equal((await pedir('cuentas/registro', { nombre: 'Nora Prueba', email, contrasena })).status, 202);
    const repetido = await correo('Alguien intentó registrarse con tu correo en HEXACORE');
    assert.ok(!repetido.texto.includes('token='));
    for (let i = 0; i < 5; i++)
        assert.equal((await pedir('sesiones', { email, contrasena: 'incorrecta de prueba' })).status, 401);
    const c = await correo('Bloqueamos temporalmente el acceso a tu cuenta de HEXACORE');
    assert.match(c.texto, /15 minutos/);
});
test('recuperación y contraseña cambiada: correos reales, enlace de un uso y revocación', async () => {
    assert.equal((await pedir('cuentas/recuperacion', { email })).status, 202);
    const c = await correo('Restablece tu contraseña de HEXACORE'), enlaceToken = enlace(c);
    const r = await pedir('cuentas/restablecer', { token: enlaceToken, contrasenaNueva: nueva });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await correo('Tu contraseña de HEXACORE ha cambiado');
    assert.equal((await pedir('cuentas/restablecer', { token: enlaceToken, contrasenaNueva: nueva })).status, 422);
    assert.equal((await pedir('cuentas/perfil', undefined, token)).status, 401);
    assert.equal((await pedir('sesiones', { email, contrasena: nueva })).status, 200);
    assert.equal((await trabajador.cola(canalObservador)).consumers, 1);
});
