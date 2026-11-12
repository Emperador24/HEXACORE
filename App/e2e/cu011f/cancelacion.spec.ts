import { expect, test, APIRequestContext } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { presentar } from '../presentacion';
import { adminURL, clienteURL, comprobarAislamiento, gateway, loginAPI, loginUI, nucleo, sql } from '../cu015/entorno';
import { comprar, entornoEntrega, h, listo } from '../cu014/entorno';
const { nucleo: controlarNucleo } = require('../../backend/test/cu012/entorno.cjs') as { nucleo(a: 'parar' | 'iniciar'): void };
test.beforeAll(comprobarAislamiento);
const hash = (x: string) => createHash('sha256').update(x).digest('hex');
const original = (pedido: string, cobro: string) => ({
  detalles: hash(sql(`SELECT jsonb_agg(d ORDER BY id) FROM alimentos.detalles_pedido d WHERE pedido_id='${pedido}'`)),
  acuerdo: hash(sql(`SELECT jsonb_build_array(cliente_id,establecimiento_id,total,moneda,metodo_entrega,creado_en,confirmado_en,codigo_qr) FROM alimentos.pedidos WHERE id='${pedido}'`)),
  cobro: hash(sql(`SELECT row_to_json(t) FROM finanzas_pagos.transacciones_pago t WHERE clave_idempotencia='${cobro}'`)),
});
const ruta = (local: string, pedido: string, base = gateway) => `${base}/pedidos/establecimientos/${local}/pedidos/${pedido}/cancelacion`;
async function cancelar(api: APIRequestContext, e: Awaited<ReturnType<typeof entornoEntrega>>, pedido: string, version: number, id = randomUUID()) {
  return api.post(ruta(e.local.id, pedido), { headers: h(e.personal.token, id), data: { version, motivo: 'No podemos preparar lo acordado', confirmar: true } });
}
async function seguimiento(api: APIRequestContext, token: string, pedido: string) {
  const r = await api.get(`${gateway}/pedidos/mis-pedidos/${pedido}`, { headers: h(token) }); expect(r.status()).toBe(200); return r.json();
}

test('CU-011F por interfaces: compra, cancelación explícita en local cerrado, respuesta perdida, reembolso y aviso sin QR', async ({ page, browser, request }) => {
  const e = await entornoEntrega(request, 'CU011F');
  await loginUI(page, clienteURL, 'cliente@hexacore.com'); await page.goto(`${clienteURL}/pedidos?eventoId=${e.evento.id}`);
  await page.getByRole('link').filter({ hasText: e.nombre }).click();
  await page.getByRole('button', { name: 'Agregar Receta CU011F', exact: true }).click();
  const checkout = page.waitForResponse(r => r.url().endsWith('/pedidos/checkout'));
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); const r = await checkout; expect(r.status()).toBe(201); const p = await r.json();
  const cobro = page.waitForResponse(r => r.url().endsWith(`/pedidos/${p.id}/pagos`));
  await page.getByRole('button', { name: 'Pagar pedido', exact: true }).click(); const pago = await cobro; expect(pago.status()).toBe(200); const pagado = await pago.json();
  const antes = original(p.id, pagado.transaccionId);
  await page.getByRole('link', { name: 'Ver seguimiento y avisos', exact: true }).click();
  await expect(page.getByAltText('Código QR del pedido confirmado')).toBeVisible();
  await presentar(page, 'Cliente: pedido pagado y QR antes de la cancelación');
  expect((await request.patch(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/estado`, { headers: h(e.organizador.token), data: { estado: 'CERRADO' } })).status()).toBe(200);
  const contexto = await browser.newContext(), operador = await contexto.newPage();
  try {
    await loginUI(operador, adminURL, 'restaurante@hexacore.com');
    await operador.getByRole('navigation').getByRole('link', { name: 'Preparación de pedidos', exact: true }).click();
    await operador.getByLabel('Establecimiento vinculado', { exact: true }).selectOption(e.local.id);
    await operador.locator(`[data-pedido="${p.id}"]`).getByRole('button', { name: 'Gestionar pedido', exact: true }).click();
    const panel = operador.getByRole('region', { name: 'Cancelación del pedido', exact: true });
    await panel.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Confirmar cancelación', exact: true })).toBeDisabled();
    await panel.getByLabel('Motivo de cancelación', { exact: true }).fill('No podemos preparar lo acordado');
    await panel.getByLabel('Confirmo cancelar este pedido y solicitar su reembolso total', { exact: true }).check();
    await presentar(operador, 'Personal: revisar motivo, efecto sobre inventario y confirmación explícita');
    let resolver!: (status: number) => void; const recibida = new Promise<number>(r => resolver = r);
    await operador.route('**/cancelacion', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      try { const real = await route.fetch({ maxRetries: 0 }); resolver(real.status()); } catch { resolver(0); }
      await route.abort('failed');
    });
    await panel.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click(); expect(await recibida).toBe(200);
    await expect(panel.getByRole('button', { name: 'Consultar cancelación pendiente', exact: true })).toBeVisible();
    const guardada = await operador.evaluate(actor => localStorage.getItem(`hexacore.cu011f.intencion.${actor}`), e.personal.usuario.id);
    expect(guardada).not.toContain(pagado.codigoQr); expect(guardada).not.toContain(e.personal.token);
    await presentar(operador, 'Personal: respuesta perdida y misma operación conservada');
    await operador.unroute('**/cancelacion'); await operador.reload();
    await panel.getByRole('button', { name: 'Consultar cancelación pendiente', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('Pedido cancelado');
    const consulta = operador.waitForResponse(r => r.url().endsWith(`/${p.id}/cancelacion`) && r.request().method() === 'GET');
    await panel.getByRole('button', { name: 'Consultar cancelación y reembolso', exact: true }).click();
    const confirmacion = await consulta; expect(confirmacion.status()).toBe(200); const c = await confirmacion.json();
    expect(c.reembolso.estado).toBe('APROBADO'); await expect(panel.locator('[data-reembolso]')).toContainText('aprobado');
    await presentar(operador, 'Personal: cancelación confirmada y aprobación del reembolso acreditada');
    await expect.poll(() => sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`)).toBe('30');
    expect(sql(`SELECT count(*) FROM alimentos.cancelaciones_pedido WHERE pedido_id='${p.id}'`)).toBe('1');
    expect(sql(`SELECT count(*) FROM alimentos.historial_preparacion WHERE pedido_id='${p.id}' AND accion='CANCELAR'`)).toBe('1');
    expect(sql(`SELECT count(*) FROM finanzas_pagos.transacciones_pago WHERE clave_idempotencia=(SELECT reembolso_id::text FROM alimentos.cancelaciones_pedido WHERE pedido_id='${p.id}') AND tipo='REEMBOLSO' AND intentos=1`)).toBe('1');
    expect(original(p.id, pagado.transaccionId)).toEqual(antes);
    await page.reload(); await expect(page.locator('[data-avance]')).toHaveText('Cancelado');
    const cliente = page.getByRole('region', { name: 'Cancelación y reembolso', exact: true });
    await expect(cliente).toContainText('No podemos preparar lo acordado'); await expect(cliente.locator('[data-cancelado]')).toBeVisible();
    await expect(cliente.locator('[data-reembolso]')).toContainText('aprobado'); await expect(page.getByAltText('Código QR del pedido confirmado')).toHaveCount(0);
    await expect(page.getByText('El establecimiento canceló tu pedido: No podemos preparar lo acordado. El reembolso se encuentra pendiente de confirmación.', { exact: true })).toBeVisible();
    await presentar(page, 'Cliente: motivo, fecha, aviso durable y reembolso confirmado sin QR utilizable');
  } finally { await contexto.close(); }
});

test('CU-011F API real: autorización, duplicados, carreras, inventario, rechazo financiero y reinicio', async ({ request }) => {
  const e = await entornoEntrega(request, 'CU011F API'), compra = await comprar(request, e), p = compra.pedido;
  const antes = original(p.id, compra.clave), version = 0, datos = { version, motivo: 'No podemos preparar lo acordado', confirmar: true };
  for (const base of [gateway, nucleo]) expect((await request.post(ruta(e.local.id, p.id, base), { headers: h(e.cliente.token, randomUUID()), data: datos })).status()).toBe(403);
  for (const d of [{ ...datos, confirmar: false }, { ...datos, motivo: ' ' }, { ...datos, monto: '0.01', moneda: 'USD', referenciaCobro: 'ajena' }]) {
    expect((await request.post(ruta(e.local.id, p.id), { headers: h(e.personal.token, randomUUID()), data: d })).status()).toBe(400);
  }
  expect((await cancelar(request, e, p.id, 99)).status()).toBe(409);
  const sinPagar = await request.post(`${gateway}/pedidos/checkout`, { headers: h(e.cliente.token), data: { eventoId: e.evento.id, establecimientoId: e.local.id, metodoEntrega: 'RECOGER', productos: [{ productoId: e.producto.id, cantidad: 1 }] } });
  expect(sinPagar.status()).toBe(201); const reservaActiva = await sinPagar.json();
  expect((await cancelar(request, e, reservaActiva.id, 0)).status()).toBe(409);
  // El consumo SQL pendiente ya descontó físico: cerrar la marca no debe liberar otra reserva.
  sql(`UPDATE alimentos.reservas_inventario SET estado='CONSUMO_PENDIENTE' WHERE pedido_id='${p.id}'`);
  const id = randomUUID(), dos = await Promise.all([cancelar(request, e, p.id, 0, id), cancelar(request, e, p.id, 0, id)]);
  expect(dos.map(r => r.status())).toEqual([200,200]); expect((await cancelar(request, e, p.id, 0)).status()).toBe(409);
  let consulta = await request.get(ruta(e.local.id, p.id), { headers: h(e.personal.token) }); expect(consulta.status()).toBe(200); let c = await consulta.json();
  expect(c).toMatchObject({ operacionId: id, inventario: 'RESTITUIDO', reembolso: { estado: 'APROBADO', monto: '1000.25', moneda: 'COP' } });
  expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`)).toBe('30');
  expect(sql(`SELECT estado FROM alimentos.reservas_inventario WHERE pedido_id='${p.id}'`)).toBe('CONSUMIDA');
  const menu = await request.get(`${gateway}/pedidos/establecimientos/${e.local.id}/productos`, { headers: h(e.cliente.token) }); expect(menu.status()).toBe(200);
  expect((await menu.json()).find((x: {id: string}) => x.id === e.producto.id)).toMatchObject({ cantidadFisica: 30, cantidadDisponible: 29, cantidadReservada: 1 });
  expect(sql(`SELECT estado FROM alimentos.reservas_inventario WHERE pedido_id='${reservaActiva.id}'`)).toBe('ACTIVA');
  expect(sql(`SELECT count(*) FROM alimentos.operaciones_inventario WHERE peticion->>'pedidoId'='${p.id}' AND peticion->>'tipo'='RESTITUCION_CU011F'`)).toBe('1');
  expect((await request.post(`${gateway}/pedidos/establecimientos/${e.local.id}/pedidos/${p.id}/preparacion`, { headers: h(e.personal.token, randomUUID()), data: { accion: 'INICIAR', version: 0, minutos: 10 } })).status()).toBe(409);
  expect((await request.post(`${gateway}/pedidos/establecimientos/${e.local.id}/entregas/prevalidar`, { headers: h(e.personal.token), data: { codigoQr: compra.pago.codigoQr } })).status()).toBe(409);
  expect((await request.post(`${gateway}/pedidos/${p.id}/pagos`, { headers: h(e.cliente.token, compra.clave), data: { tokenPago: 'tok_ok_replay' } })).status()).toBe(409);
  expect(original(p.id, compra.clave)).toEqual(antes);

  const preparable = await comprar(request, e);
  const carrera = await Promise.all([cancelar(request, e, preparable.pedido.id, 0), request.post(`${gateway}/pedidos/establecimientos/${e.local.id}/pedidos/${preparable.pedido.id}/preparacion`, { headers: h(e.personal.token, randomUUID()), data: { accion: 'INICIAR', version: 0, minutos: 10 } })]);
  expect(carrera.map(r => r.status()).sort()).toEqual([200,409]);
  if (carrera[1].status() === 200) {
    expect((await cancelar(request, e, preparable.pedido.id, 1)).status()).toBe(200);
    const estado = await seguimiento(request, e.cliente.token, preparable.pedido.id); expect(estado.cancelacion.inventario).toBe('NO_REINCORPORAR');
  }
  const entregable = await comprar(request, e); await listo(request, e, entregable.pedido.id);
  const pre = await request.post(`${gateway}/pedidos/establecimientos/${e.local.id}/entregas/prevalidar`, { headers: h(e.personal.token), data: { codigoQr: entregable.pago.codigoQr } }); expect(pre.status()).toBe(200); const v = await pre.json();
  const conflictoEntrega = await Promise.all([cancelar(request, e, entregable.pedido.id, 2), request.post(`${gateway}/pedidos/establecimientos/${e.local.id}/entregas/confirmar`, { headers: h(e.personal.token, randomUUID()), data: { pedidoId: entregable.pedido.id, version: v.version, puntoRevision: v.puntoRevision, codigoQr: entregable.pago.codigoQr } })]);
  expect(conflictoEntrega.map(r => r.status()).sort()).toEqual([200,409]);
  expect(sql(`SELECT (SELECT count(*) FROM alimentos.cancelaciones_pedido WHERE pedido_id='${entregable.pedido.id}')+(SELECT count(*) FROM alimentos.entregas_pedido WHERE pedido_id='${entregable.pedido.id}')`)).toBe('1');
  if (conflictoEntrega[0].status() === 200) expect((await seguimiento(request, e.cliente.token, entregable.pedido.id)).cancelacion.inventario).toBe('NO_REINCORPORAR');
  else expect((await cancelar(request, e, entregable.pedido.id, 3)).status()).toBe(409);

  const preparada = await comprar(request, e);
  expect((await request.post(`${gateway}/pedidos/establecimientos/${e.local.id}/pedidos/${preparada.pedido.id}/preparacion`, { headers: h(e.personal.token, randomUUID()), data: { accion: 'INICIAR', version: 0, minutos: 10 } })).status()).toBe(200);
  const fisicoAntes = sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`);
  expect((await cancelar(request, e, preparada.pedido.id, 1)).status()).toBe(200);
  expect((await seguimiento(request, e.cliente.token, preparada.pedido.id)).cancelacion.inventario).toBe('NO_REINCORPORAR');
  expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`)).toBe(fisicoAntes);

  const rechazo = await comprar(request, e, 'tok_noreemb_cu011f'); expect((await cancelar(request, e, rechazo.pedido.id, 0)).status()).toBe(200);
  consulta = await request.get(ruta(e.local.id, rechazo.pedido.id), { headers: h(e.personal.token) }); expect(consulta.status()).toBe(200); c = await consulta.json(); expect(c.reembolso.estado).toBe('RECHAZADO');
  expect((await seguimiento(request, e.cliente.token, rechazo.pedido.id)).estado).toBe('CANCELADO');
  const durable = await seguimiento(request, e.cliente.token, p.id); expect(durable.codigoQr).toBeNull(); expect(durable.avisos.filter((a: {accion: string}) => a.accion === 'CANCELAR')).toHaveLength(1);
  const fisicoReinicio = sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`);
  controlarNucleo('parar'); controlarNucleo('iniciar');
  expect(await seguimiento(request, e.cliente.token, p.id)).toEqual(durable);
  expect((await cancelar(request, e, p.id, 0, id)).status()).toBe(200); expect(original(p.id, compra.clave)).toEqual(antes);
  expect(sql(`SELECT count(*) FROM alimentos.cancelaciones_pedido WHERE pedido_id='${p.id}'`)).toBe('1');
  expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${e.producto.id}'`)).toBe(fisicoReinicio);
});

test('CU-011F revalida cuenta y vínculo después de admitir la petición, sin cancelación ni reembolso ajenos', async ({ request }) => {
  const e = await entornoEntrega(request, 'CU011F autorización'), compra = await comprar(request, e), admin = await loginAPI(request, 'admin@hexacore.com');
  const email = `cu011f-${randomUUID()}@example.test`;
  expect((await request.post(`${gateway}/cuentas/registro`, { data: { nombre: 'Personal propio CU011F', email, contrasena: process.env.CU015_CLAVE_DEMO } })).status()).toBe(202);
  const actorId = sql(`SELECT id FROM identidad.usuarios WHERE email='${email}'`); expect(actorId).toMatch(/^[a-f0-9-]{36}$/);
  expect((await request.post(`${gateway}/admin/cuentas/${actorId}/activar`, { headers: h(admin.token), data: { motivo: 'Fixture propio CU011F' } })).status()).toBe(200);
  sql(`INSERT INTO identidad.usuarios_roles(usuario_id,rol_id,asignado_por) SELECT '${actorId}',id,'${admin.usuario.id}' FROM identidad.roles WHERE nombre='Personal'`);
  expect((await request.put(`${gateway}/pedidos/admin/establecimientos/${e.local.id}/personal/${actorId}`, { headers: h(e.organizador.token) })).status()).toBe(200);
  let actor = await loginAPI(request, email);
  const { execFileSync } = require('node:child_process'), { resolve } = require('node:path'), { Client } = require('../../backend/node_modules/pg');
  const config = JSON.parse(execFileSync('python3', [resolve(__dirname, '../../infra/revision/revision.py'), '--perfil', 'cu015', 'config'], { encoding: 'utf8' })); expect(config.name).toBe('hexacore-cu015-sebastian');
  const env = config.services.nucleo.environment, opts = { host: '127.0.0.1', port: 15459, database: 'hexacore_cu015', user: env.POSTGRES_USUARIO, password: env.POSTGRES_CONTRASENA, connectionTimeoutMillis: 3000, query_timeout: 3000, statement_timeout: 3000, application_name: 'cu011f-carrera-autorizacion' };
  const bloqueo = new Client(opts), observador = new Client(opts); await bloqueo.connect(); await observador.connect();
  try {
    const pid = (await bloqueo.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    for (const tipo of ['cuenta', 'vinculo']) {
      if (tipo === 'vinculo') { expect((await request.post(`${gateway}/admin/cuentas/${actorId}/activar`, { headers: h(admin.token), data: { motivo: 'Restaurar fixture para segunda carrera' } })).status()).toBe(200); actor = await loginAPI(request, email); }
      await bloqueo.query('BEGIN');
      try {
        if (tipo === 'cuenta') await bloqueo.query("UPDATE identidad.usuarios SET estado='DESACTIVADA' WHERE id=$1", [actorId]);
        else await bloqueo.query('DELETE FROM alimentos.personal_establecimiento WHERE establecimiento_id=$1 AND usuario_id=$2', [e.local.id, actorId]);
        const respuesta = request.post(ruta(e.local.id, compra.pedido.id), { headers: h(actor.token, randomUUID()), data: { version: 0, motivo: 'No se puede preparar', confirmar: true } });
        await expect.poll(async () => Number((await observador.query("SELECT count(*) n FROM pg_stat_activity WHERE application_name='nucleo-alimentos' AND $1=ANY(pg_blocking_pids(pid))", [pid])).rows[0].n)).toBeGreaterThan(0);
        await bloqueo.query('COMMIT'); expect((await respuesta).status()).toBe(403);
      } finally { await bloqueo.query('ROLLBACK'); }
      expect(sql(`SELECT count(*) FROM alimentos.cancelaciones_pedido WHERE pedido_id='${compra.pedido.id}'`)).toBe('0');
      expect(sql(`SELECT count(*) FROM alimentos.historial_preparacion WHERE pedido_id='${compra.pedido.id}' AND accion='CANCELAR'`)).toBe('0');
    }
  } finally { await bloqueo.end(); await observador.end(); }
});
