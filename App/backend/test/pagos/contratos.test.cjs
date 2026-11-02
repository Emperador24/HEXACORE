const { base: basePruebas, opcionesPg } = require('../base-unica/conexiones.cjs');
'use strict';
// Contratos del módulo real y del webhook único, en infraestructura compartida exclusiva.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');
const Redis = require('ioredis');
const { connect } = require('amqplib');
const { JwtService } = require('@nestjs/jwt');
process.env = {...require('../base-unica/conexiones.cjs').entorno(), PROGRAMA_BACKEND:'contratos'};
const { NestFactory } = require('@nestjs/core');
const { PagosModule, PagosService, CobrarDto, ReembolsarDto, validarSolicitudPagos } = require('../../dist/modulos/finanzas/pagos');
let contexto, pagos;
const run = 'pagos-' + randomUUID();
const clave = (nombre) => `${run}:${nombre}`;
const base = 'http://127.0.0.1:13109/api/v1';
const secreto = 'backend-webhook-pruebas';
const datos = new Client(opcionesPg('pagos'));
const redis = new Redis({ host: '127.0.0.1', port: 16384, lazyConnect: true });
const jti = randomUUID();
let token, amqp, canal, aprobado;
const recibidos = [];
const cobro = (nombre, cambio = {}) => ({ claveIdempotencia: clave(nombre), solicitante: 'pruebas-pagos', monto: 1150.25, moneda: 'COP', token: 'tok_ok_' + run, descripcion: 'Fixture financiero aislado', ...cambio });
async function pedir(ruta, cuerpo) {
    try {
        const dto = await validarSolicitudPagos(ruta === '/pagos' ? CobrarDto : ReembolsarDto, cuerpo);
        const body = ruta === '/pagos' ? await pagos.cobrar(dto) : await pagos.reembolsar(dto);
        return { status: 200, body };
    }
    catch (e) {
        if (typeof e.getStatus !== 'function')
            throw e;
        return { status: e.getStatus(), body: e.getResponse() };
    }
}
async function fila(nombre) {
    const r = await datos.query('SELECT * FROM transacciones_pago WHERE clave_idempotencia=$1', [clave(nombre)]);
    assert.equal(r.rowCount, 1);
    return r.rows[0];
}
async function webhook(raw, firma) {
    const r = await fetch(base + '/pagos/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(firma ? { 'X-Pasarela-Firma': firma } : {}) }, body: raw, signal: AbortSignal.timeout(10000) });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const firmar = (raw) => createHmac('sha256', secreto).update(raw).digest('hex');
async function esperar(accion) {
    const limite = Date.now() + 5000;
    while (!accion()) {
        assert.ok(Date.now() < limite, 'Evento de este fixture no recibido en 5 segundos');
        await new Promise(r => setTimeout(r, 25));
    }
}
before(async () => {
    assert.equal(process.version, 'v22.22.3');
    contexto = await NestFactory.createApplicationContext(PagosModule, { logger: ['error'] });
    pagos = contexto.get(PagosService);
    await datos.connect();
    assert.equal((await datos.query('SELECT current_database() AS base')).rows[0].base, basePruebas);
    await redis.connect();
    assert.equal(await redis.ping(), 'PONG');
    token = new JwtService().sign({ sub: randomUUID(), roles: ['Cliente'], jti }, { algorithm: 'RS256', issuer: 'hexacore-administracion', expiresIn: '10m', privateKey: readFileSync(resolve(__dirname, '../claves/jwt-privada.pem'), 'utf8') });
    amqp = await connect('amqp://cu011_e2e:cu011_e2e@127.0.0.1:15679/cu011', { clientProperties: { connection_name: 'contratos-pagos' } });
    canal = await amqp.createChannel();
    const cola = await canal.assertQueue('', { exclusive: true, autoDelete: true });
    await canal.bindQueue(cola.queue, 'pagos.eventos', 'pago.*');
    await canal.consume(cola.queue, mensaje => {
        if (!mensaje)
            return;
        const e = JSON.parse(mensaje.content.toString());
        if (e.claveIdempotencia?.startsWith(run))
            recibidos.push(e);
        canal.ack(mensaje);
    });
});
after(async () => {
    if (redis.status === 'ready')
        await redis.del('sesion-revocada:' + jti);
    await canal?.close();
    await amqp?.close();
    await redis.quit();
    await datos.end();
    await contexto?.close();
});
test('salud y migración conservan la base y el historial existentes', async () => {
    const r = await fetch(base + '/salud');
    assert.equal(r.status, 200);
    const h = await r.json();
    assert.equal(h.servicio, 'nucleo');
    assert.equal(h.dependencias.postgres.pagos, 'arriba');
    const m = await datos.query('SELECT name FROM migraciones ORDER BY id');
    assert.deepEqual(m.rows.map(x => x.name), ['EsquemaPagos1790380800000']);
});
test('no hay endpoints financieros y las rutas llamantes conservan JWT/revocación', async () => {
    for (const url of [base, 'http://127.0.0.1:13117/api/v1']) {
        for (const ruta of ['/pagos', '/pagos/reembolsos']) {
            const r = await fetch(url + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cobro('sin-sesion')) });
            assert.equal(r.status, 404);
        }
    }
    assert.equal((await fetch('http://127.0.0.1:13117/api/v1/pagos/webhook', { method: 'POST' })).status, 404);
    for (const url of [base + '/pedidos/checkout', 'http://127.0.0.1:13117/api/v1/compras']) {
        const enviar = (auth) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: '{}' });
        assert.equal((await enviar()).status, 401);
        await redis.set('sesion-revocada:' + jti, '1', 'EX', 60);
        assert.equal((await enviar(token)).status, 401);
        await redis.del('sesion-revocada:' + jti);
    }
    assert.equal((await datos.query('SELECT count(*)::int AS n FROM transacciones_pago WHERE clave_idempotencia=ANY($1)', [[clave('sin-sesion'), clave('revocada')]])).rows[0].n, 0);
});
test('cobro aprobado conserva importe decimal, moneda, solicitante y referencia', async () => {
    const r = await pedir('/pagos', cobro('aprobado'));
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['motivo', 'referencia', 'repetida', 'resultado']);
    assert.equal(r.body.resultado, 'APROBADO');
    assert.equal(r.body.repetida, false);
    assert.match(r.body.referencia, /^pas_[0-9a-f-]{36}$/);
    aprobado = r.body;
    const f = await fila('aprobado');
    assert.equal(f.tipo, 'COBRO');
    assert.equal(f.monto, '1150.25');
    assert.equal(f.moneda, 'COP');
    assert.equal(f.solicitante, 'pruebas-pagos');
    assert.equal(f.referencia, aprobado.referencia);
    assert.equal(f.intentos, 1);
});
test('repetir un cobro final devuelve lo guardado sin otro movimiento en el libro', async () => {
    const r = await pedir('/pagos', cobro('aprobado'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ...aprobado, repetida: true });
    assert.equal((await fila('aprobado')).intentos, 1);
});
test('rechazo y repetición conservan el estado terminal', async () => {
    const dto = cobro('rechazado', { token: 'tok_rechazo_' + run, moneda: 'USD', monto: 12.5 });
    const r = await pedir('/pagos', dto);
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'RECHAZADO');
    const otra = await pedir('/pagos', dto);
    assert.deepEqual(otra.body, { ...r.body, repetida: true });
    const f = await fila('rechazado');
    assert.equal(f.moneda, 'USD');
    assert.equal(f.monto, '12.50');
    assert.equal(f.intentos, 1);
});
test('una clave con otro monto, moneda o tipo conserva el conflicto HTTP 409', async () => {
    for (const cambio of [{ monto: 1200 }, { moneda: 'USD' }]) {
        const r = await pedir('/pagos', cobro('aprobado', cambio));
        assert.equal(r.status, 409);
        assert.equal(r.body.codigo, 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE');
    }
    const r = await pedir('/pagos/reembolsos', { claveIdempotencia: clave('aprobado'), solicitante: 'pruebas-pagos', referenciaCobro: aprobado.referencia, monto: 1150.25, moneda: 'COP', motivo: 'Fixture' });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE');
    assert.equal((await fila('aprobado')).intentos, 1);
});
test('reembolso parcial aprobado y repetido conserva su propia operación', async () => {
    const dto = { claveIdempotencia: clave('reembolso'), solicitante: 'pruebas-pagos', referenciaCobro: aprobado.referencia, monto: 150.25, moneda: 'COP', motivo: 'Fixture parcial' };
    const r = await pedir('/pagos/reembolsos', dto);
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'APROBADO');
    assert.equal(r.body.repetida, false);
    const repetida = await pedir('/pagos/reembolsos', dto);
    assert.deepEqual(repetida.body, { ...r.body, repetida: true });
    const f = await fila('reembolso');
    assert.equal(f.tipo, 'REEMBOLSO');
    assert.equal(f.monto, '150.25');
    assert.equal(f.moneda, 'COP');
    assert.equal(f.solicitante, 'pruebas-pagos');
    assert.equal(f.intentos, 1);
});
test('reembolso rechazado por el simulador se conserva y no se vuelve a intentar', async () => {
    const c = await pedir('/pagos', cobro('no-reembolsable', { token: 'tok_noreemb_' + run }));
    assert.equal(c.body.resultado, 'APROBADO');
    const dto = { claveIdempotencia: clave('reembolso-rechazado'), solicitante: 'pruebas-pagos', referenciaCobro: c.body.referencia, monto: 10, moneda: 'COP', motivo: 'Fixture rechazo' };
    const r = await pedir('/pagos/reembolsos', dto);
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'RECHAZADO');
    assert.deepEqual((await pedir('/pagos/reembolsos', dto)).body, { ...r.body, repetida: true });
    assert.equal((await fila('reembolso-rechazado')).intentos, 1);
});
test('fallo de pasarela conserva INDETERMINADO y cuenta el reintento con la misma clave', async () => {
    const dto = cobro('incierto', { token: 'tok_error_' + run });
    for (let intento = 1; intento <= 2; intento++) {
        const r = await pedir('/pagos', dto);
        assert.equal(r.status, 200);
        assert.equal(r.body.resultado, 'INDETERMINADO');
        assert.equal(r.body.repetida, false);
        const f = await fila('incierto');
        assert.equal(f.intentos, intento);
        assert.equal(f.resultado, 'INDETERMINADO');
    }
    const timeout = await pedir('/pagos', cobro('timeout', { token: 'tok_timeout_' + run }));
    assert.equal(timeout.body.resultado, 'INDETERMINADO');
    assert.match(timeout.body.motivo, /TimeoutError/);
    assert.equal((await fila('timeout')).resultado, 'INDETERMINADO');
    assert.equal((await fila('timeout')).intentos, 1);
});
const notificacion = () => ({ claveIdempotencia: clave('incierto'), operacion: 'COBRO', resultado: 'APROBADO', referencia: 'pas_' + randomUUID(), motivo: null });
test('webhook verifica HMAC de los bytes originales, no del JSON serializado otra vez', async () => {
    const n = notificacion();
    const raw = JSON.stringify(n, null, 2) + '\n';
    for (const firma of [undefined, '0'.repeat(64), firmar(JSON.stringify(n))]) {
        const r = await webhook(raw, firma);
        assert.equal(r.status, 401);
        assert.equal(r.body.codigo, 'FIRMA_INVALIDA');
    }
    assert.equal((await fila('incierto')).resultado, 'INDETERMINADO');
    assert.equal((await webhook(raw, firmar(raw))).status, 204);
    const f = await fila('incierto');
    assert.equal(f.resultado, 'APROBADO');
    assert.equal(f.referencia, n.referencia);
    assert.equal(f.intentos, 2);
    assert.equal(f.monto, '1150.25');
    assert.equal(f.moneda, 'COP');
    await esperar(() => recibidos.some(e => e.claveIdempotencia === clave('incierto')));
    const e = recibidos.find(e => e.claveIdempotencia === clave('incierto'));
    assert.equal(e.tipo, 'PAGO_APROBADO');
    assert.equal(e.id, clave('incierto') + ':APROBADO');
    assert.equal(e.operacion, 'COBRO');
    assert.equal(e.monto, 1150.25);
    assert.equal(e.moneda, 'COP');
    assert.equal(e.solicitante, 'pruebas-pagos');
    // Actualizar libro y publicar no equivale a finalizar pedido o compra: F12 sigue pendiente.
    assert.equal((await webhook(raw, firmar(raw))).status, 204);
    await esperar(() => recibidos.filter(e => e.claveIdempotencia === clave('incierto')).length >= 2);
    assert.equal((await fila('incierto')).intentos, 2);
    assert.ok(recibidos.filter(e => e.claveIdempotencia === clave('incierto')).every(e => e.id === clave('incierto') + ':APROBADO'));
});
test('webhook desconocido y tipo incompatible conservan 404/409 sin cambiar el libro', async () => {
    for (const [n, status, codigo] of [[{ ...notificacion(), claveIdempotencia: clave('desconocida') }, 404, 'OPERACION_DESCONOCIDA'], [{ ...notificacion(), operacion: 'REEMBOLSO' }, 409, 'OPERACION_INCOMPATIBLE']]) {
        const raw = JSON.stringify(n), r = await webhook(raw, firmar(raw));
        assert.equal(r.status, status);
        assert.equal(r.body.codigo, codigo);
    }
    assert.equal((await fila('incierto')).resultado, 'APROBADO');
});
test('DTO rechaza moneda desconocida, precisión inválida y campos adicionales', async () => {
    for (const cambio of [{ moneda: 'XXX' }, { monto: 1.001 }, { campoAjeno: true }])
        assert.equal((await pedir('/pagos', cobro('invalido', cambio))).status, 400);
    const n = { ...notificacion(), resultado: 'INDETERMINADO' }, raw = JSON.stringify(n);
    assert.equal((await webhook(raw, firmar(raw))).status, 400);
    assert.equal((await datos.query('SELECT count(*)::int AS n FROM transacciones_pago WHERE clave_idempotencia=$1', [clave('invalido')])).rows[0].n, 0);
});
test('SIGTERM cierra ambos programas y el reinicio conserva libro/referencia sin repetir migración', async () => {
    const { execFileSync } = require('node:child_process');
    const compose = require('../base-unica/compose.cjs').argumentos(true);
    const inspeccionar = (servicio) => JSON.parse(execFileSync('docker', ['inspect', `${require('../base-unica/conexiones.cjs').proyecto}-${servicio}-1`], { encoding: 'utf8' }))[0];
    const migracion = inspeccionar('preparacion-base').State.FinishedAt;
    execFileSync('docker', [...compose, 'stop', 'nucleo', 'boleteria'], { encoding: 'utf8' });
    for (const app of ['nucleo', 'boleteria']) {
        const estado = inspeccionar(app).State;
        assert.ok([0, 143].includes(estado.ExitCode));
        assert.equal(estado.OOMKilled, false);
        assert.equal((await datos.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1', ['finanzas-pagos:' + app])).rows[0].n, 0);
        assert.ok(!(await redis.client('LIST')).includes('name=' + app + ' '));
    }
    const r = await fetch('http://127.0.0.1:16779/api/connections', { headers: { Authorization: 'Basic ' + Buffer.from('cu011_e2e:cu011_e2e').toString('base64') } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).filter(c => ['hexacore-nucleo', 'hexacore-boleteria'].includes(c.client_properties.connection_name)).length, 0);
    execFileSync('docker', [...compose, 'up', '-d', '--no-deps', '--no-build', '--wait', 'nucleo', 'boleteria'], { encoding: 'utf8' });
    assert.equal(inspeccionar('preparacion-base').State.FinishedAt, migracion);
    const repetida = await pedir('/pagos', cobro('aprobado'));
    assert.equal(repetida.status, 200);
    assert.deepEqual(repetida.body, { ...aprobado, repetida: true });
    const f = await fila('aprobado');
    assert.equal(f.intentos, 1);
    assert.equal(f.monto, '1150.25');
});
