const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connect } = require('amqplib');
const ref = require('./correos-referencia.json');
const { iniciar, cerrar, gestion, cola: leerCola, esperar, rabbit } = require('./proceso.cjs');
const run = randomUUID();
let worker, replica, amqp, canal;
const cola = () => leerCola(canal);
const evento = (tipo = 'VERIFICACION', cambio = {}) => ({ evento: 'CORREO_PENDIENTE', version: 1, id: randomUUID(), ocurridoEn: new Date().toISOString(), tipo, destinatario: { email: randomUUID() + '@example.test', nombre: 'Nora' }, token: 'fixture-token', ...cambio });
async function publicar(e, id = e?.id || randomUUID()) {
    const raw = typeof e === 'string' ? e : JSON.stringify(e);
    await new Promise((resolve, reject) => canal.publish('cuentas.eventos', 'cuenta.correo', Buffer.from(raw), { persistent: true, messageId: id, contentType: 'application/json' }, err => err ? reject(err) : resolve()));
    return id;
}
async function estado(para) { const r = await fetch('http://127.0.0.1:13103/estado?para=' + encodeURIComponent(para)); assert.equal(r.status, 200); return (await r.json()).intentos; }
async function regla(para, r) { const a = await fetch('http://127.0.0.1:13103/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ para, ...r }) }); assert.equal(a.status, 200); }
async function enviado(e, n = 1) { return esperar(async () => { const a = await estado(e.destinatario.email); return a.length >= n && a; }); }
async function vacia() { await esperar(async () => { const q = await cola(); return q.messages_ready === 0 && q.messages_unacknowledged === 0; }); }
async function muerto(id) {
    const m = await esperar(() => canal.get('cuentas.correos.dlq', { noAck: false }));
    assert.equal(m.properties.messageId, id);
    assert.equal(m.properties.headers['x-death'][0].reason, 'rejected');
    canal.ack(m);
    return m;
}
async function reiniciar() { await cerrar(worker); worker = null; await esperar(async () => (await cola()).consumers === 0); worker = await iniciar(); }
before(async () => {
    assert.equal(process.version, 'v22.22.3');
    worker = await iniciar();
    amqp = await connect(rabbit, { clientProperties: { connection_name: 'pruebas-correo-' + run } });
    canal = await amqp.createConfirmChannel();
    const q = await canal.checkQueue('cuentas.correos');
    assert.equal(q.messageCount, 0);
    assert.equal(q.consumerCount, 1);
});
after(async () => { try {
    await cerrar(replica);
    await cerrar(worker);
}
finally {
    await canal?.close();
    await amqp?.close();
} });
test('salud y topología durables originales; sin endpoints de negocio ni dependencias SQL/Redis/JWT', async () => {
    const r = await fetch('http://127.0.0.1:13098/api/v1/salud');
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).dependencias, { rabbitmq: 'arriba' });
    const q = await cola();
    assert.equal(q.durable, true);
    assert.equal(q.arguments['x-dead-letter-exchange'], 'cuentas.muertos');
    assert.equal(q.arguments['x-dead-letter-routing-key'], 'cuentas.correos');
    assert.equal(q.consumers, 1);
    const bindings = await gestion('bindings/trabajador_e2e');
    assert.ok(bindings.some(b => b.source === 'cuentas.eventos' && b.destination === 'cuentas.correos' && b.routing_key === 'cuenta.correo'));
    const dlq = await gestion('queues/trabajador_e2e/cuentas.correos.dlq');
    assert.equal(dlq.durable, true);
    assert.equal((await fetch('http://127.0.0.1:13098/api/v1/correos', { method: 'POST' })).status, 404);
});
for (const tipo of Object.keys(ref))
    test('contenido y envío de ' + tipo, async () => {
        const e = evento(tipo);
        await publicar(e);
        const a = await enviado(e);
        await vacia();
        assert.equal(a.length, 1);
        assert.equal(a[0].status, 202);
        assert.deepEqual(a[0].cuerpo, { ...ref[tipo], para: e.destinatario.email });
    });
test('4xx permanente: un intento y DLQ', async () => {
    const e = evento();
    await regla(e.destinatario.email, { defecto: 400 });
    await publicar(e);
    await muerto(e.id);
    assert.equal((await estado(e.destinatario.email)).length, 1);
});
test('5xx transitorio: dos fallos, tercer intento entrega', async () => {
    const e = evento();
    await regla(e.destinatario.email, { estados: [503, 503, 202] });
    await publicar(e);
    const a = await enviado(e, 3);
    await vacia();
    assert.deepEqual(a.map(x => x.status), [503, 503, 202]);
});
test('5xx persistente: máximo tres intentos y DLQ', async () => {
    const e = evento();
    await regla(e.destinatario.email, { defecto: 503 });
    await publicar(e);
    await muerto(e.id);
    assert.equal((await estado(e.destinatario.email)).length, 3);
});
test('fallo de red: tres intentos y DLQ', async () => {
    const e = evento();
    await regla(e.destinatario.email, { defecto: -1 });
    await publicar(e);
    await muerto(e.id);
    assert.equal((await estado(e.destinatario.email)).length, 3);
});
test('timeout real de 10 s: tres intentos y DLQ sin convertirlo en error permanente', async () => {
    const e = evento();
    await regla(e.destinatario.email, { defecto: 0 });
    await publicar(e);
    const m = await esperar(() => canal.get('cuentas.correos.dlq', { noAck: false }), 35000);
    assert.equal(m.properties.messageId, e.id);
    canal.ack(m);
    assert.equal((await estado(e.destinatario.email)).length, 3);
});
test('JSON ilegible y versión desconocida van a DLQ sin proveedor', async () => {
    const id = await publicar('{ JSON ilegible');
    await muerto(id);
    const e = evento('VERIFICACION', { version: 2 });
    await publicar(e);
    await muerto(e.id);
    assert.equal((await estado(e.destinatario.email)).length, 0);
});
test('límite previo: evento/tipo desconocidos conservan fallback a registro duplicado', async () => {
    const e = evento('NO_EXISTE', { evento: 'OTRO' });
    await publicar(e);
    const a = await enviado(e);
    await vacia();
    assert.deepEqual(a[0].cuerpo, { ...ref.REGISTRO_DUPLICADO, para: e.destinatario.email });
});
test('duplicado en la misma instancia: un solo envío', async () => {
    const e = evento();
    await publicar(e);
    await enviado(e);
    await vacia();
    await publicar(e);
    await esperar(() => worker.salida.includes(`repetido para ${e.destinatario.email}`));
    await vacia();
    assert.equal((await estado(e.destinatario.email)).length, 1);
});
test('reconexión: salud degradada y un solo consumidor al recuperar', async () => {
    const q = await cola();
    assert.equal(q.consumer_details.length, 1);
    const nombre = q.consumer_details[0].channel_details.connection_name;
    await gestion('connections/' + encodeURIComponent(nombre), 'DELETE');
    await esperar(async () => { const r = await fetch('http://127.0.0.1:13098/api/v1/salud'); return r.status === 503; }, 3000);
    await esperar(async () => (await cola()).consumers === 1);
    const e = evento();
    await publicar(e);
    await enviado(e);
    await vacia();
    assert.equal((await cola()).consumers, 1);
});
test('detener conserva pendientes; reiniciar procesa y pierde deduplicación en memoria', async () => {
    const e = evento();
    await publicar(e);
    await enviado(e);
    await vacia();
    await cerrar(worker);
    worker = null;
    await esperar(async () => (await cola()).consumers === 0);
    await publicar(e);
    assert.equal((await canal.checkQueue('cuentas.correos')).messageCount, 1);
    worker = await iniciar();
    await enviado(e, 2);
    await vacia();
    assert.equal((await estado(e.destinatario.email)).length, 2);
});
test('dos instancias no comparten deduplicación: el mismo evento puede enviarse dos veces', async () => {
    const e = evento();
    await regla(e.destinatario.email, { retener: [1, 2] });
    await publicar(e);
    await enviado(e);
    replica = await iniciar(13099);
    await esperar(async () => (await cola()).consumers === 2);
    await publicar(e);
    await enviado(e, 2);
    await regla(e.destinatario.email, { liberar: true });
    await esperar(() => worker.salida.includes(`entregado a ${e.destinatario.email}`) && replica.salida.includes(`entregado a ${e.destinatario.email}`));
    await vacia();
    assert.equal((await estado(e.destinatario.email)).filter(x => x.aceptado).length, 2);
    await cerrar(replica);
    replica = null;
    await esperar(async () => (await cola()).consumers === 1);
});
test('SIGTERM con envío aceptado en vuelo: reentrega y posible duplicado, sin drain durable previo', async () => {
    const e = evento();
    await regla(e.destinatario.email, { retener: [1] });
    await publicar(e);
    await enviado(e);
    await cerrar(worker);
    worker = null;
    await esperar(async () => (await cola()).consumers === 0);
    assert.equal((await canal.checkQueue('cuentas.correos')).messageCount, 1);
    await regla(e.destinatario.email, { liberar: true });
    worker = await iniciar();
    await enviado(e, 2);
    await vacia();
    assert.equal((await estado(e.destinatario.email)).filter(x => x.aceptado).length, 2);
});
test('contador en memoria reinicia: el límite de tres no es global entre reinicios', async () => {
    const e = evento();
    await regla(e.destinatario.email, { defecto: 503, retener: [2] });
    await publicar(e);
    await enviado(e, 2);
    await cerrar(worker);
    worker = null;
    await regla(e.destinatario.email, { defecto: 503, liberar: true });
    worker = await iniciar();
    await muerto(e.id);
    assert.equal((await estado(e.destinatario.email)).length, 5);
});
test('límite previo de mensaje null: queda sin ack y bloquea prefetch hasta intervención', async () => {
    const id = await publicar('null');
    await esperar(() => worker.salida.includes('Fallo no controlado enviando un correo'));
    await esperar(async () => (await cola()).messages_unacknowledged === 1);
    assert.ok(worker.salida.includes('Fallo no controlado enviando un correo'));
    await cerrar(worker);
    worker = null;
    await esperar(async () => (await cola()).consumers === 0);
    const m = await canal.get('cuentas.correos', { noAck: false });
    assert.ok(m);
    assert.equal(m.properties.messageId, id);
    assert.equal(m.content.toString(), 'null');
    canal.nack(m, false, false);
    await muerto(id);
    worker = await iniciar();
    await vacia();
});
