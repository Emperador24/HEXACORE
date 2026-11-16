import { expect, Page, test } from '../csp.fixture';
import { randomUUID } from 'node:crypto';
import { actuar, presentar } from '../presentacion';
import { adminURL, clienteURL, comprobarAislamiento, crearEvento, gateway, loginAPI, loginUI, nucleo, productoPropio, sql } from './entorno';

test.beforeAll(() => comprobarAislamiento());

async function llenar(page: Page, nombre: string, contacto = 'Contacto CU015 · 3001234567') {
  await actuar(page.getByLabel('Nombre', { exact: true }), objetivo => objetivo.fill(nombre));
  await actuar(page.getByLabel('Contacto', { exact: true }), objetivo => objetivo.fill(contacto));
  await actuar(page.getByLabel('Punto de entrega', { exact: true }), objetivo => objetivo.fill('Puerta de prueba CU015'));
  await actuar(page.getByLabel('Apertura', { exact: true }), objetivo => objetivo.fill('00:00'));
  await actuar(page.getByLabel('Cierre', { exact: true }), objetivo => objetivo.fill('00:00'));
  await actuar(page.getByLabel('Zona horaria', { exact: true }), objetivo => objetivo.fill('America/Bogota'));
}

test('CU-015 por portales: registrar, persistir, editar, validar y operar; regresión de pago CU-011', async ({ page, browser, request }, info) => {
  const organizador = await loginAPI(request, 'organizador@hexacore.com');
  const nombre = `CU015 ${randomUUID().slice(0, 8)}`;
  const evento = await crearEvento(request, organizador.token, `Evento ${nombre}`);
  let localId = '';
  let pedidoId = '';
  await test.step('Login administrativo y registro para el evento creado por CU-026', async () => {
    await loginUI(page, adminURL, 'organizador@hexacore.com');
    await actuar(page.getByRole('navigation').getByRole('link', { name: 'Establecimientos', exact: true }), objetivo => objetivo.click());
    await actuar(page.getByLabel('Evento', { exact: true }), objetivo => objetivo.selectOption(evento.id));
    await actuar(page.getByRole('button', { name: 'Nuevo establecimiento' }), objetivo => objetivo.click());
    await expect(page.getByRole('button', { name: 'Guardar establecimiento' })).toBeDisabled();
    await llenar(page, nombre);
    const creada = page.waitForResponse(r => r.url().endsWith('/pedidos/admin/establecimientos') && r.request().method() === 'POST');
    await actuar(page.getByRole('button', { name: 'Guardar establecimiento' }), objetivo => objetivo.click());
    const r = await creada;
    expect(r.status()).toBe(201); localId = (await r.json()).id;
    await expect(page.getByRole('status')).toHaveText('Establecimiento registrado.');
    await actuar(page, objetivo => objetivo.reload());
    await expect(page.getByRole('row').filter({ hasText: nombre })).toContainText('Recibe pedidos');
    await presentar(page, 'Organizador: establecimiento registrado y persistido');
  });

  await test.step('Duplicado e información inválida se rechazan sin mutar el registro', async () => {
    await actuar(page.getByRole('button', { name: 'Nuevo establecimiento' }), objetivo => objetivo.click());
    await llenar(page, `  ${nombre.toUpperCase()}  `);
    await actuar(page.getByRole('button', { name: 'Guardar establecimiento' }), objetivo => objetivo.click());
    await expect(page.getByRole('alert')).toContainText('ya está registrado');
    await presentar(page, 'Organizador: rechazo del establecimiento duplicado');
    await llenar(page, `${nombre} inválido`);
    await actuar(page.getByLabel('Zona horaria', { exact: true }), objetivo => objetivo.fill('Planeta/Inexistente'));
    await actuar(page.getByRole('button', { name: 'Guardar establecimiento' }), objetivo => objetivo.click());
    await expect(page.getByRole('alert')).toContainText('zona horaria IANA');
    await presentar(page, 'Organizador: validación de la zona horaria');
    await actuar(page.getByRole('button', { name: 'Cancelar', exact: true }), objetivo => objetivo.click());
    expect(sql(`SELECT count(*) FROM alimentos.establecimientos WHERE evento_id='${evento.id}';`)).toBe('1');
  });

  const editado = `${nombre} editado`;
  await test.step('Editar nombre, contacto y entrega y comprobarlos tras recargar', async () => {
    await actuar(page.getByRole('row').filter({ hasText: nombre }).getByRole('button', { name: 'Editar', exact: true }), objetivo => objetivo.click());
    await llenar(page, editado, 'Contacto actualizado CU015');
    await actuar(page.getByLabel('Punto de entrega', { exact: true }), objetivo => objetivo.fill('Puerta actualizada CU015'));
    await actuar(page.getByRole('button', { name: 'Guardar establecimiento' }), objetivo => objetivo.click());
    await expect(page.getByRole('status')).toHaveText('Establecimiento actualizado.');
    await actuar(page, objetivo => objetivo.reload());
    await expect(page.getByRole('row').filter({ hasText: editado })).toContainText('Contacto actualizado CU015');
    await expect(page.getByRole('row').filter({ hasText: editado })).toContainText('Puerta actualizada CU015');
    await presentar(page, 'Organizador: edición conservada después de recargar');
  });

  const productoId = await productoPropio(request, localId, organizador.token);
  const cliente = await browser.newContext();
  const comprador = await cliente.newPage();
  try {
    await test.step('Cliente compra con reservas, pago y QR reales', async () => {
      await loginUI(comprador, clienteURL, 'cliente@hexacore.com');
      await actuar(comprador, objetivo => objetivo.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`));
      await actuar(comprador.getByRole('link').filter({ hasText: editado }), objetivo => objetivo.click());
      await actuar(comprador.getByRole('button', { name: 'Agregar Producto CU015', exact: true }), objetivo => objetivo.click());
      await presentar(comprador, 'Cliente: menú y carrito antes del checkout');
      const checkout = comprador.waitForResponse(r => r.url().endsWith('/pedidos/checkout'));
      await actuar(comprador.getByRole('button', { name: 'Continuar', exact: true }), objetivo => objetivo.click());
      const creado = await checkout; expect(creado.status()).toBe(201); pedidoId = (await creado.json()).id;
      await actuar(comprador.getByRole('button', { name: 'Pagar pedido', exact: true }), objetivo => objetivo.click());
      await expect(comprador.getByRole('heading', { name: '¡Tu pedido está confirmado!' })).toBeVisible();
      await expect(comprador.getByAltText('Código QR del pedido confirmado')).toBeVisible();
      expect(sql(`SELECT estado||'|'||total||'|'||moneda||'|'||(codigo_qr IS NOT NULL) FROM alimentos.pedidos WHERE id='${pedidoId}';`)).toBe('CONFIRMADO|1000.00|COP|true');
      await presentar(comprador, 'Cliente: pago confirmado y QR disponible');
    });

    const historial = sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${pedidoId}';`);
    await test.step('Deshabilitar bloquea un checkout desde un menú ya abierto y oculta el catálogo', async () => {
      await actuar(comprador, objetivo => objetivo.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`));
      await actuar(comprador.getByRole('link').filter({ hasText: editado }), objetivo => objetivo.click());
      await actuar(comprador.getByRole('button', { name: 'Agregar Producto CU015', exact: true }), objetivo => objetivo.click());
      await presentar(page, 'Organizador: deshabilitar el establecimiento con un menú cliente abierto');
      await actuar(page.getByRole('row').filter({ hasText: editado }).getByRole('button', { name: 'Deshabilitar', exact: true }), objetivo => objetivo.click());
      await expect(page.getByRole('status')).toContainText('deshabilitado');
      await presentar(page, 'Organizador: establecimiento deshabilitado');
      await presentar(comprador, 'Cliente: intentar checkout desde el menú anterior');
      const rechazo = comprador.waitForResponse(r => r.url().endsWith('/pedidos/checkout'));
      await actuar(comprador.getByRole('button', { name: 'Continuar', exact: true }), objetivo => objetivo.click());
      expect((await rechazo).status()).toBe(409);
      await expect(comprador.getByRole('alert')).toContainText('no está disponible');
      await presentar(comprador, 'Cliente: checkout rechazado por cierre');
      await actuar(comprador, objetivo => objetivo.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`));
      await expect(comprador.getByText('Aún no hay establecimientos disponibles')).toBeVisible();
      await presentar(comprador, 'Cliente: catálogo sin establecimientos disponibles');
      await actuar(page, objetivo => objetivo.reload());
      await expect(page.getByRole('row').filter({ hasText: editado })).toContainText('DESHABILITADO');
      expect(sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${pedidoId}';`)).toBe(historial);
    });

    await test.step('Habilitar recupera el catálogo; un horario cerrado vuelve a bloquearlo', async () => {
      const fila = page.getByRole('row').filter({ hasText: editado });
      await presentar(page, 'Organizador: volver a habilitar el establecimiento');
      await actuar(fila.getByRole('button', { name: 'Habilitar', exact: true }), objetivo => objetivo.click());
      await expect(page.getByRole('status')).toContainText('habilitado');
      await actuar(comprador, objetivo => objetivo.reload());
      await expect(comprador.getByRole('link').filter({ hasText: editado })).toBeVisible();
      await presentar(comprador, 'Cliente: catálogo recuperado al habilitar');
      await presentar(page, 'Organizador: configurar un horario cerrado');
      await actuar(fila.getByRole('button', { name: 'Editar', exact: true }), objetivo => objetivo.click());
      // Ventana de un minuto en UTC, doce horas después de ahora: siempre cerrada al ejecutar.
      const abre = new Date(Date.now() + 43_200_000).toISOString().slice(11, 16);
      const cierra = new Date(Date.now() + 43_260_000).toISOString().slice(11, 16);
      await actuar(page.getByLabel('Apertura', { exact: true }), objetivo => objetivo.fill(abre));
      await actuar(page.getByLabel('Cierre', { exact: true }), objetivo => objetivo.fill(cierra));
      await actuar(page.getByLabel('Zona horaria', { exact: true }), objetivo => objetivo.fill('UTC'));
      await actuar(page.getByRole('button', { name: 'Guardar establecimiento' }), objetivo => objetivo.click());
      await expect(page.getByRole('status')).toContainText('actualizado');
      await actuar(page, objetivo => objetivo.reload());
      await expect(fila).toContainText(`${abre} – ${cierra}`);
      await expect(fila).toContainText('No recibe pedidos');
      await presentar(page, 'Organizador: horario cerrado persistido');
      await actuar(comprador, objetivo => objetivo.reload());
      await expect(comprador.getByText('Aún no hay establecimientos disponibles')).toBeVisible();
      const sesion = await loginAPI(request, 'cliente@hexacore.com');
      const intento = await request.post(`${gateway}/pedidos/checkout`, { headers: { Authorization: `Bearer ${sesion.token}` }, data: {
        eventoId: evento.id, establecimientoId: localId, metodoEntrega: 'RECOGER', productos: [{ productoId, cantidad: 1 }],
      } });
      expect(intento.status()).toBe(409);
      expect(sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${pedidoId}';`)).toBe(historial);
      expect(sql(`SELECT cantidad_inventario FROM alimentos.productos WHERE id='${productoId}';`)).toBe('4');
      await presentar(comprador, 'Cliente: horario cerrado y pedido pagado conservado');
    });
    await page.screenshot({ path: info.outputPath('administracion-cu015.png'), fullPage: true });
  } finally { await cliente.close(); }
});

test('Backend: roles, datos, duplicados concurrentes, evento vigente y personal por establecimiento', async ({ request }) => {
  const organizador = await loginAPI(request, 'organizador@hexacore.com');
  const admin = await loginAPI(request, 'admin@hexacore.com');
  const cliente = await loginAPI(request, 'cliente@hexacore.com');
  const personal = await loginAPI(request, 'restaurante@hexacore.com');
  const evento = await crearEvento(request, organizador.token, `Evento CU015 API ${randomUUID().slice(0, 8)}`);
  const url = '/pedidos/admin/establecimientos';
  const datos = { eventoId: evento.id, nombre: `Local ${randomUUID()}`, contacto: 'Contacto de prueba', puntoEntrega: 'Puerta 1',
    horaApertura: '00:00', horaCierre: '00:00', zonaHoraria: 'America/Bogota', estado: 'DISPONIBLE' };
  const h = (token: string) => ({ Authorization: `Bearer ${token}` });

  for (const destino of [gateway, nucleo]) {
    expect((await request.post(`${destino}${url}`, { data: datos })).status()).toBe(401);
    for (const usuario of [cliente, personal]) {
      expect((await request.post(`${destino}${url}`, { headers: h(usuario.token), data: datos })).status()).toBe(403);
      expect((await request.get(`${destino}${url}?eventoId=${evento.id}`, { headers: h(usuario.token) })).status()).toBe(403);
    }
  }
  const invalido = await request.post(`${gateway}${url}`, { headers: h(admin.token), data: { ...datos, horaApertura: '25:00', contacto: ' ', puntoEntrega: '', nombre: ' ' } });
  expect(invalido.status()).toBe(400);
  expect((await request.post(`${gateway}${url}`, { headers: h(admin.token), data: { ...datos, eventoId: randomUUID() } })).status()).toBe(404);
  const respuestas = await Promise.all([1, 2].map(() => request.post(`${gateway}${url}`, { headers: h(admin.token), data: datos })));
  expect(respuestas.map(r => r.status()).sort()).toEqual([201, 409]);
  const local = await respuestas.find(r => r.status() === 201)!.json();
  for (const destino of [gateway, nucleo]) {
    for (const usuario of [cliente, personal]) {
      expect((await request.put(`${destino}${url}/${local.id}`, { headers: h(usuario.token), data: datos })).status()).toBe(403);
      expect((await request.patch(`${destino}${url}/${local.id}/estado`, { headers: h(usuario.token), data: { estado: 'DESHABILITADO' } })).status()).toBe(403);
    }
  }
  expect((await request.put(`${gateway}${url}/${local.id}`, { headers: h(organizador.token), data: { ...datos, contacto: 'Contacto editado' } })).status()).toBe(200);
  expect((await request.get(`${gateway}${url}?eventoId=${evento.id}`, { headers: h(admin.token) })).status()).toBe(200);

  const menu = `${gateway}/pedidos/establecimientos/${local.id}/menu`;
  expect((await request.get(menu, { headers: h(personal.token) })).status()).toBe(403);
  expect((await request.put(`${gateway}${url}/${local.id}/personal/${cliente.usuario.id}`, { headers: h(admin.token) })).status()).toBe(400);
  expect((await request.put(`${gateway}${url}/${local.id}/personal/${personal.usuario.id}`, { headers: h(admin.token) })).status()).toBe(200);
  expect((await request.get(menu, { headers: h(personal.token) })).status()).toBe(200);
  expect((await request.get(`${gateway}/pedidos/establecimientos/${local.id}/pedidos`, { headers: h(personal.token) })).status()).toBe(200);
  expect((await request.delete(`${gateway}${url}/${local.id}/personal/${personal.usuario.id}`, { headers: h(admin.token) })).status()).toBe(204);
  expect((await request.get(menu, { headers: h(personal.token) })).status()).toBe(403);
  // CU-026 cambia la autoridad; Alimentos no depende de un evento sembrado.
  expect((await request.post(`${gateway}/eventos/${evento.id}/cancelar`, { headers: h(organizador.token), data: { version: evento.version, motivo: 'Fin del escenario CU015' } })).status()).toBe(200);
  const catalogo = await request.get(`${gateway}/pedidos/eventos/${evento.id}/establecimientos`, { headers: h(cliente.token) });
  expect(catalogo.status()).toBe(200); expect(await catalogo.json()).toEqual([]);
  const lista = await request.get(`${gateway}${url}?eventoId=${evento.id}`, { headers: h(admin.token) });
  expect((await lista.json())[0]).toMatchObject({ id: local.id, recibePedidos: false });
});
