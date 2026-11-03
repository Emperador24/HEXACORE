const { base: basePruebas, opcionesPg } = require('../base-unica/conexiones.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { Client } = require('pg');
const { cifrarContrasena } = require('../../dist/modulos/identidad/comun/contrasenas');
const {proyecto} = require('../base-unica/conexiones.cjs');
// También conserva el override por digest al detener/reiniciar imágenes publicadas.
const compose = require('../base-unica/compose.cjs').argumentos(true);
const gateway = 'http://127.0.0.1:18082/api/v1';
const nucleo = 'http://127.0.0.1:13109/api/v1', boleteria = 'http://127.0.0.1:13117/api/v1';
const id = randomUUID(), email = `convivencia-${id}@example.test`, contrasena = 'pagos-locales-aislados';
const evento = randomUUID(), local = randomUUID(), producto = randomUUID(), localidad = randomUUID(), claveComida = randomUUID();
const db = {};
let token, compra, pagada, pedido, comida, entradaClave, referenciaEntrada;
const inspeccionar = servicio => JSON.parse(execFileSync('docker', ['inspect', `${proyecto}-${servicio}-1`], { encoding: 'utf8' }))[0];
async function pedir(base, ruta, method = 'GET', body, headers = {}) {
    const r = await fetch(base + ruta, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const raw = await r.text();
    return { status: r.status, body: raw ? JSON.parse(raw) : null, upstream: r.headers.get('X-Servidor') };
}
async function movimiento(clave) {
    const r = await db.libro.query('SELECT * FROM transacciones_pago WHERE clave_idempotencia=$1', [clave]);
    assert.equal(r.rowCount, 1);
    return r.rows[0];
}
async function checkout() {
    const r = await pedir(gateway, '/pedidos/checkout', 'POST', { eventoId: evento, establecimientoId: local, metodoEntrega: 'RECOGER', productos: [{ productoId: producto, cantidad: 1 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
}
before(async () => {
    assert.equal(process.version, 'v22.22.3');
    for (const [n, database] of Object.entries({ identidad: basePruebas, alimentos: basePruebas, ventas: basePruebas, catalogo: basePruebas, postventa: basePruebas, acceso: basePruebas, libro: basePruebas })) {
        db[n] = new Client(opcionesPg(n));
        await db[n].connect();
        assert.equal((await db[n].query('SELECT current_database() AS base')).rows[0].base, database);
    }
    await db.identidad.query("INSERT INTO usuarios(id,nombre,email,hash_contrasena,estado,verificado_en) VALUES($1,'Convivencia',$2,$3,'ACTIVA',now())", [id, email, await cifrarContrasena(contrasena)]);
    await db.identidad.query("INSERT INTO usuarios_roles(usuario_id,rol_id) SELECT $1,id FROM roles WHERE nombre='Cliente'", [id]);
    await db.alimentos.query("INSERT INTO eventos_referencia(evento_id,nombre,disponible) VALUES($1,'Convivencia',true)", [evento]);
    await db.alimentos.query("INSERT INTO establecimientos(id,evento_id,nombre,estado,punto_entrega) VALUES($1,$2,'Local convivencia','DISPONIBLE','Prueba aislada')", [local, evento]);
    await db.alimentos.query("INSERT INTO productos(id,establecimiento_id,nombre,precio,activo,cantidad_inventario) VALUES($1,$2,'Producto convivencia',1150.25,true,8)", [producto, local]);
    execFileSync('docker', [...compose, 'exec', '-T', 'nucleo', 'node', 'dist/modulos/alimentos/inventario/preparar-inventario.js', local, '--compras-detenidas'], { encoding: 'utf8' });
    for (const n of ['ventas', 'catalogo', 'postventa', 'acceso']) {
        const campos = n === 'postventa' ? ',permite_reventa' : `,estado${n === 'acceso' ? ',aforo_maximo' : ',categoria'}`;
        const valores = n === 'postventa' ? ',true' : `,'PUBLICADO'${n === 'acceso' ? ',100' : ",'Conciertos'"}`;
        await db[n].query(`INSERT INTO eventos_referencia(evento_id,nombre,fecha_inicio,lugar,ciudad${campos}) VALUES($1,'Convivencia',now()+interval '30 days','Recinto','Bogotá'${valores})`, [evento]);
        if (['ventas', 'catalogo'].includes(n))
            await db[n].query("INSERT INTO localidades_evento(localidad_id,evento_id,nombre,precio,aforo) VALUES($1,$2,'General',1234.50,8)", [localidad, evento]);
    }
});
after(async () => { for (const cliente of Object.values(db))
    await cliente.end(); });
test('dos procesos, un mismo libro y una sola tarea de migración financiera', async () => {
    const configs = {};
    for (const [app, url] of [['nucleo', nucleo], ['boleteria', boleteria]]) {
        const salud = await pedir(url, '/salud');
        assert.equal(salud.status, 200);
        assert.equal(salud.body.dependencias.postgres.pagos, 'arriba');
        const c = inspeccionar(app);
        configs[app] = Object.fromEntries(c.Config.Env.map(e => { const i = e.indexOf('='); return [e.slice(0, i), e.slice(i + 1)]; }));
        const ps = execFileSync('docker', [...compose, 'exec', '-T', app, 'ps', '-o', 'pid,args'], { encoding: 'utf8' });
        assert.equal(ps.split('\n').filter(l => new RegExp(`^\\s*\\d+\\s+node dist/apps/${app}/main\\.js$`).test(l.trim())).length, 1, ps);
        assert.ok(!configs[app].PAGOS_URL);
    }
    for (const key of ['POSTGRES_HOST', 'POSTGRES_PUERTO', 'POSTGRES_USUARIO', 'POSTGRES_BD'])
        assert.equal(configs.nucleo[key], configs.boleteria[key]);
    assert.equal(configs.nucleo.POSTGRES_BD, basePruebas);
    assert.ok(configs.nucleo.PASARELA_SECRETO_WEBHOOK);
    assert.ok(!configs.boleteria.PASARELA_SECRETO_WEBHOOK);
    assert.ok(!configs.boleteria.AUTH_JWT_CLAVE_PRIVADA_ARCHIVO);
    const conexiones = await db.libro.query("SELECT DISTINCT application_name,datname FROM pg_stat_activity WHERE application_name IN ('finanzas-pagos:nucleo','finanzas-pagos:boleteria') ORDER BY application_name");
    assert.deepEqual(conexiones.rows, [{ application_name: 'finanzas-pagos:boleteria', datname: basePruebas }, { application_name: 'finanzas-pagos:nucleo', datname: basePruebas }]);
    assert.equal(inspeccionar('preparacion-base').State.ExitCode, 0);
    assert.equal(inspeccionar('preparacion-base').State.Status, 'exited');
    assert.equal((await db.libro.query('SELECT count(*)::int AS n FROM migraciones')).rows[0].n, 1);
});
test('login real, alimentos y entradas escriben sus claves y referencias en ese mismo libro', async () => {
    const login = await pedir(gateway, '/sesiones', 'POST', { email, contrasena });
    assert.equal(login.status, 200);
    token = login.body.token;
    assert.equal((await pedir(gateway, '/cuentas/perfil')).body.id, id);
    pedido = await checkout();
    comida = await pedir(gateway, `/pedidos/${pedido.id}/pagos`, 'POST', { tokenPago: 'tok_ok_convivencia' }, { 'Idempotency-Key': claveComida });
    assert.equal(comida.status, 200, JSON.stringify(comida.body));
    assert.equal(comida.body.estadoPedido, 'CONFIRMADO');
    const f = await movimiento(claveComida);
    assert.equal(f.solicitante, 'alimentos');
    assert.equal(f.monto, '1150.25');
    assert.equal(f.moneda, 'COP');
    assert.equal(f.referencia, comida.body.referenciaPasarela);
    assert.equal(f.intentos, 1);
    const turno = await pedir(gateway, `/cola/eventos/${evento}/turnos`, 'POST');
    assert.equal(turno.status, 201);
    const r = await pedir(gateway, '/compras', 'POST', { localidadId: localidad, cantidad: 1 }, { 'X-Turno-Cola': turno.body.token });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    compra = r.body;
    pagada = await pedir(gateway, `/compras/${compra.id}/pagar`, 'POST', { metodoPago: 'TARJETA', token: 'tok_ok_convivencia' });
    assert.equal(pagada.status, 200);
    assert.equal(pagada.body.estado, 'PAGADA');
    entradaClave = compra.id + ':0';
    const e = await movimiento(entradaClave);
    referenciaEntrada = e.referencia;
    assert.equal(e.solicitante, 'entradas');
    assert.equal(e.monto, '1234.50');
    assert.equal(e.moneda, 'COP');
    assert.equal(e.intentos, 1);
    assert.equal((await db.ventas.query('SELECT referencia_pasarela FROM compras WHERE id=$1', [compra.id])).rows[0].referencia_pasarela, referenciaEntrada);
    assert.equal((await db.libro.query('SELECT count(*)::int AS n FROM transacciones_pago WHERE clave_idempotencia=ANY($1)', [[claveComida, entradaClave]])).rows[0].n, 2);
});
test('reinicio de ambos programas conserva resultados, referencias y efectos únicos', async () => {
    const fin = inspeccionar('preparacion-base').State.FinishedAt;
    execFileSync('docker', [...compose, 'stop', 'nucleo', 'boleteria'], { encoding: 'utf8' });
    for (const app of ['nucleo', 'boleteria']) {
        assert.ok([0, 143].includes(inspeccionar(app).State.ExitCode));
        assert.equal(inspeccionar(app).State.OOMKilled, false);
        assert.equal((await db.libro.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1', ['finanzas-pagos:' + app])).rows[0].n, 0);
    }
    execFileSync('docker', [...compose, 'up', '-d', '--no-deps', '--no-build', '--wait', 'nucleo', 'boleteria'], { encoding: 'utf8' });
    assert.equal(inspeccionar('preparacion-base').State.FinishedAt, fin);
    const replay = await pedir(gateway, `/pedidos/${pedido.id}/pagos`, 'POST', { tokenPago: 'tok_ok_convivencia' }, { 'Idempotency-Key': claveComida });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.referenciaPasarela, comida.body.referenciaPasarela);
    assert.equal(replay.body.codigoQr, comida.body.codigoQr);
    const venta = await pedir(gateway, `/compras/${compra.id}/pagar`, 'POST', { metodoPago: 'TARJETA', token: 'tok_ok_convivencia' });
    // Contrato previo de Ventas: una compra PAGADA responde 409 al volver a pagar.
    assert.equal(venta.status, 409);
    assert.equal(venta.body.codigo, 'COMPRA_NO_PAGABLE');
    const detalle = await pedir(gateway, `/compras/${compra.id}`);
    assert.equal(detalle.status, 200);
    assert.deepEqual(detalle.body.entradas, pagada.body.entradas);
    assert.equal((await movimiento(entradaClave)).referencia, referenciaEntrada);
    for (const clave of [claveComida, entradaClave])
        assert.equal((await movimiento(clave)).intentos, 1);
    assert.equal((await db.alimentos.query('SELECT cantidad_inventario FROM productos WHERE id=$1', [producto])).rows[0].cantidad_inventario, 7);
    assert.equal((await db.ventas.query('SELECT count(*)::int AS n FROM entradas WHERE compra_id=$1', [compra.id])).rows[0].n, 1);
});
test('cancelación y reembolso locales mantienen el contrato existente sin otro movimiento al repetir', async () => {
    const cotizacion = await pedir(gateway, `/compras/${compra.id}/cancelacion/cotizacion`, 'POST', {});
    assert.equal(cotizacion.status, 200);
    const cancelar = () => pedir(gateway, `/compras/${compra.id}/cancelaciones`, 'POST', { motivo: 'Fixture convivencia', montoAceptado: cotizacion.body.montoReembolso });
    const r = await cancelar();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.estado, 'APROBADA');
    const f = await movimiento(r.body.cancelacionId);
    assert.equal(f.tipo, 'REEMBOLSO');
    assert.equal(f.solicitante, 'entradas');
    assert.equal(f.monto, '1234.50');
    assert.equal(f.referencia, r.body.referenciaReembolso);
    // La compra CANCELADA conserva su 409 previo; no crea otro reembolso.
    const otra = await cancelar();
    assert.equal(otra.status, 409);
    assert.equal(otra.body.codigo, 'COMPRA_NO_CANCELABLE');
    const repetida = await movimiento(r.body.cancelacionId);
    assert.equal(repetida.referencia, r.body.referenciaReembolso);
    assert.equal(repetida.intentos, 1);
    assert.equal((await db.ventas.query('SELECT count(*)::int AS n FROM cancelaciones WHERE compra_id=$1', [compra.id])).rows[0].n, 1);
});
test('callback financiero auténtico/duplicado no finaliza el pedido incierto: F12 permanece; logout revoca en ambos', async () => {
    const incierto = await checkout(), clave = randomUUID();
    const pago = await pedir(gateway, `/pedidos/${incierto.id}/pagos`, 'POST', { tokenPago: 'tok_error_convivencia' }, { 'Idempotency-Key': clave });
    assert.equal(pago.status, 502, JSON.stringify(pago.body));
    assert.equal(pago.body.estadoPago, 'FALLIDA');
    assert.equal((await movimiento(clave)).resultado, 'INDETERMINADO');
    const raw = JSON.stringify({ claveIdempotencia: clave, operacion: 'COBRO', resultado: 'APROBADO', referencia: 'pas_' + randomUUID(), motivo: null }, null, 2) + '\n';
    const enviar = firma => fetch(gateway + '/pagos/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pasarela-Firma': firma }, body: raw });
    assert.equal((await enviar('0'.repeat(64))).status, 401);
    assert.equal((await movimiento(clave)).resultado, 'INDETERMINADO');
    const firma = createHmac('sha256', 'backend-webhook-pruebas').update(raw).digest('hex');
    assert.equal((await enviar(firma)).status, 204);
    assert.equal((await enviar(firma)).status, 204);
    assert.equal((await movimiento(clave)).resultado, 'APROBADO');
    assert.equal((await db.alimentos.query('SELECT estado FROM transacciones_pedido WHERE id=$1', [clave])).rows[0].estado, 'FALLIDA');
    assert.equal((await db.alimentos.query('SELECT estado FROM pedidos WHERE id=$1', [incierto.id])).rows[0].estado, 'PENDIENTE_PAGO');
    const replay = await pedir(gateway, `/pedidos/${incierto.id}/pagos`, 'POST', { tokenPago: 'tok_ok_no_debe_cobrar' }, { 'Idempotency-Key': clave });
    assert.equal(replay.status, 502);
    assert.equal(replay.body.estadoPago, 'FALLIDA');
    assert.equal((await movimiento(clave)).intentos, 1);
    assert.equal((await pedir(gateway, '/sesiones/actual', 'DELETE')).status, 200);
    assert.equal((await pedir(nucleo, '/pedidos/checkout', 'POST', {})).status, 401);
    assert.equal((await pedir(boleteria, '/compras', 'POST', {})).status, 401);
});
