import { expect, Page, test } from '../csp.fixture';
import { randomUUID } from 'node:crypto';
import { presentar } from '../presentacion';
import { adminURL, clienteURL, comprobarAislamiento, crearEvento, gateway, loginAPI, loginUI, nucleo, productoPropio, sql } from './entorno';

test.beforeAll(() => comprobarAislamiento());

async function llenar(page: Page, nombre: string, contacto = 'Contacto CU015 · 3001234567') {
  await page.getByLabel('Nombre', { exact: true }).fill(nombre);
  await page.getByLabel('Contacto', { exact: true }).fill(contacto);
  await page.getByLabel('Punto de entrega', { exact: true }).fill('Puerta de prueba CU015');
  await page.getByLabel('Apertura', { exact: true }).fill('00:00');
  await page.getByLabel('Cierre', { exact: true }).fill('00:00');
  await page.getByLabel('Zona horaria', { exact: true }).fill('America/Bogota');
}

test('CU-015 por portales: registrar, persistir, editar, validar y operar; regresión de pago CU-011', async ({ page, browser, request }, info) => {
  const organizador = await loginAPI(request, 'organizador@hexacore.com');
  const nombre = `CU015 ${randomUUID().slice(0, 8)}`;
  const evento = await crearEvento(request, organizador.token, `Evento ${nombre}`);
  let localId = '';
  let pedidoId = '';
  await test.step('Login administrativo y registro para el evento creado por CU-026', async () => {
    await loginUI(page, adminURL, 'organizador@hexacore.com');
    await page.getByRole('navigation').getByRole('link', { name: 'Establecimientos', exact: true }).click();
    await page.getByLabel('Evento', { exact: true }).selectOption(evento.id);
    await page.getByRole('button', { name: 'Nuevo establecimiento' }).click();
    await expect(page.getByRole('button', { name: 'Guardar establecimiento' })).toBeDisabled();
    await llenar(page, nombre);
    const creada = page.waitForResponse(r => r.url().endsWith('/pedidos/admin/establecimientos') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Guardar establecimiento' }).click();
    const r = await creada;
    expect(r.status()).toBe(201); localId = (await r.json()).id;
    await expect(page.getByRole('status')).toHaveText('Establecimiento registrado.');
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: nombre })).toContainText('Recibe pedidos');
    await presentar(page, 'Organizador: establecimiento registrado y persistido');
  });

  await test.step('Duplicado e información inválida se rechazan sin mutar el registro', async () => {
    await page.getByRole('button', { name: 'Nuevo establecimiento' }).click();
    await llenar(page, `  ${nombre.toUpperCase()}  `);
    await page.getByRole('button', { name: 'Guardar establecimiento' }).click();
    await expect(page.getByRole('alert')).toContainText('ya está registrado');
    await presentar(page, 'Organizador: rechazo del establecimiento duplicado');
    await llenar(page, `${nombre} inválido`);
    await page.getByLabel('Zona horaria', { exact: true }).fill('Planeta/Inexistente');
    await page.getByRole('button', { name: 'Guardar establecimiento' }).click();
    await expect(page.getByRole('alert')).toContainText('zona horaria IANA');
    await presentar(page, 'Organizador: validación de la zona horaria');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(sql(`SELECT count(*) FROM alimentos.establecimientos WHERE evento_id='${evento.id}';`)).toBe('1');
  });

  const editado = `${nombre} editado`;
  await test.step('Editar nombre, contacto y entrega y comprobarlos tras recargar', async () => {
    await page.getByRole('row').filter({ hasText: nombre }).getByRole('button', { name: 'Editar', exact: true }).click();
    await llenar(page, editado, 'Contacto actualizado CU015');
    await page.getByLabel('Punto de entrega', { exact: true }).fill('Puerta actualizada CU015');
    await page.getByRole('button', { name: 'Guardar establecimiento' }).click();
    await expect(page.getByRole('status')).toHaveText('Establecimiento actualizado.');
    await page.reload();
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
      await comprador.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`);
      await comprador.getByRole('link').filter({ hasText: editado }).click();
      await comprador.getByRole('button', { name: 'Agregar Producto CU015', exact: true }).click();
      await presentar(comprador, 'Cliente: menú y carrito antes del checkout');
      const checkout = comprador.waitForResponse(r => r.url().endsWith('/pedidos/checkout'));
      await comprador.getByRole('button', { name: 'Continuar', exact: true }).click();
      const creado = await checkout; expect(creado.status()).toBe(201); pedidoId = (await creado.json()).id;
      await comprador.getByRole('button', { name: 'Pagar pedido', exact: true }).click();
      await expect(comprador.getByRole('heading', { name: '¡Tu pedido está confirmado!' })).toBeVisible();
      await expect(comprador.getByAltText('Código QR del pedido confirmado')).toBeVisible();
      expect(sql(`SELECT estado||'|'||total||'|'||moneda||'|'||(codigo_qr IS NOT NULL) FROM alimentos.pedidos WHERE id='${pedidoId}';`)).toBe('CONFIRMADO|1000.00|COP|true');
      await presentar(comprador, 'Cliente: pago confirmado y QR disponible');
    });

    const historial = sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${pedidoId}';`);
    await test.step('Deshabilitar bloquea un checkout desde un menú ya abierto y oculta el catálogo', async () => {
      await comprador.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`);
      await comprador.getByRole('link').filter({ hasText: editado }).click();
      await comprador.getByRole('button', { name: 'Agregar Producto CU015', exact: true }).click();
      await presentar(page, 'Organizador: deshabilitar el establecimiento con un menú cliente abierto');
      await page.getByRole('row').filter({ hasText: editado }).getByRole('button', { name: 'Deshabilitar', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('deshabilitado');
      await presentar(page, 'Organizador: establecimiento deshabilitado');
      await presentar(comprador, 'Cliente: intentar checkout desde el menú anterior');
      const rechazo = comprador.waitForResponse(r => r.url().endsWith('/pedidos/checkout'));
      await comprador.getByRole('button', { name: 'Continuar', exact: true }).click();
      expect((await rechazo).status()).toBe(409);
      await expect(comprador.getByRole('alert')).toContainText('no está disponible');
      await presentar(comprador, 'Cliente: checkout rechazado por cierre');
      await comprador.goto(`${clienteURL}/pedidos?eventoId=${evento.id}`);
      await expect(comprador.getByText('Aún no hay establecimientos disponibles')).toBeVisible();
      await presentar(comprador, 'Cliente: catálogo sin establecimientos disponibles');
      await page.reload();
      await expect(page.getByRole('row').filter({ hasText: editado })).toContainText('DESHABILITADO');
      expect(sql(`SELECT row_to_json(p) FROM alimentos.pedidos p WHERE id='${pedidoId}';`)).toBe(historial);
    });

    await test.step('Habilitar recupera el catálogo; un horario cerrado vuelve a bloquearlo', async () => {
      const fila = page.getByRole('row').filter({ hasText: editado });
      await presentar(page, 'Organizador: volver a habilitar el establecimiento');
      await fila.getByRole('button', { name: 'Habilitar', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('habilitado');
      await comprador.reload();
      await expect(comprador.getByRole('link').filter({ hasText: editado })).toBeVisible();
      await presentar(comprador, 'Cliente: catálogo recuperado al habilitar');
      await presentar(page, 'Organizador: configurar un horario cerrado');
      await fila.getByRole('button', { name: 'Editar', exact: true }).click();
      // Ventana de un minuto en UTC, doce horas después de ahora: siempre cerrada al ejecutar.
      const abre = new Date(Date.now() + 43_200_000).toISOString().slice(11, 16);
      const cierra = new Date(Date.now() + 43_260_000).toISOString().slice(11, 16);
      await page.getByLabel('Apertura', { exact: true }).fill(abre);
      await page.getByLabel('Cierre', { exact: true }).fill(cierra);
      await page.getByLabel('Zona horaria', { exact: true }).fill('UTC');
      await page.getByRole('button', { name: 'Guardar establecimiento' }).click();
      await expect(page.getByRole('status')).toContainText('actualizado');
      await page.reload();
      await expect(fila).toContainText(`${abre} – ${cierra}`);
      await expect(fila).toContainText('No recibe pedidos');
      await presentar(page, 'Organizador: horario cerrado persistido');
      await comprador.reload();
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
