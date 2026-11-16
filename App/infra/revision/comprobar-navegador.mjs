/** Chrome real sobre recursos exclusivos de revisión. Crea dos compras demo; no resembrar. */
import puppeteer from '../../frontend/portal-web-cliente/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const CLIENTE = 'http://revision.localhost:14210';
const ADMIN = 'http://revision.localhost:14211';
const salida = process.argv[2];
if (salida) await mkdir(salida, { recursive: true });
const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, defaultViewport: { width: 1440, height: 1000 },
});
const respuestas = [], errores = [], paginas = [];
async function pagina() {
  const p = await (await navegador.createBrowserContext()).newPage();
  paginas.push(p);
  p.on('pageerror', e => errores.push(e.message));
  p.on('request', r => {
    const u = new URL(r.url());
    // Solo los proveedores visuales externos (fuentes/imágenes) pueden salir del entorno.
    if (u.pathname.startsWith('/api/v1') || u.pathname === '/correos') {
      assert.equal(u.hostname, 'revision.localhost', 'Petición hacia otro entorno');
      assert.ok(['18090', '13128'].includes(u.port), 'Puerto del entorno habitual');
    }
  });
  p.on('response', async r => {
    if (r.url().startsWith('http://revision.localhost:18090/api/v1')) {
      respuestas.push({ url: new URL(r.url()).pathname, metodo: r.request().method(), estado: r.status() });
    }
  });
  return p;
}
async function escribir(p, selector, valor) {
  await p.waitForSelector(selector, { visible: true });
  await p.$eval(selector, (e, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  }, valor);
}
async function texto(p, t) {
  await p.waitForFunction(t => document.body.innerText.includes(t), { timeout: 20000 }, t);
}
async function boton(p, t) {
  await p.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.innerText.includes(t) && !b.disabled), {}, t);
  await p.evaluate(t => [...document.querySelectorAll('button')].find(b => b.innerText.includes(t) && !b.disabled).click(), t);
}
async function login(p, base, correo) {
  await p.goto(base + '/login', { waitUntil: 'networkidle0' });
  assert.equal(await p.evaluate(() => window.HEXACORE_CONFIGURACION.api), 'http://revision.localhost:18090/api/v1');
  await escribir(p, 'input[name="correo"]', correo);
  await escribir(p, 'input[name="contrasena"]', 'hexacore2026');
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => location.pathname !== '/login', { timeout: 20000 });
}
try {
  const p = await pagina();
  await login(p, CLIENTE, 'cliente@hexacore.com');
  await texto(p, 'Ana');
  await p.reload({ waitUntil: 'networkidle0' });
  await texto(p, 'Ana');
  const cookie = (await p.cookies(CLIENTE + '/api/v1/sesiones/renovar')).find(c => c.name === 'hxc_renovacion');
  assert.ok(cookie?.httpOnly && cookie.sameSite === 'Strict');
  assert.equal(cookie.domain, 'revision.localhost');
  console.log('1. Cliente: login, CORS con credenciales, cookie propia y renovación tras recarga');

  await p.goto(CLIENTE + '/pedidos', { waitUntil: 'networkidle0' });
  await texto(p, 'Food Truck La Sazón');
  await p.click('a[href*="/pedidos/30000000-0000-4000-8000-000000000001"]');
  await p.waitForSelector('button[aria-label^="Agregar Hamburguesa"]');
  await p.click('button[aria-label^="Agregar Hamburguesa"]');
  await p.click('button[type="submit"]');
  await texto(p, 'Revisa tu pedido');
  await boton(p, 'Pagar pedido');
  await texto(p, '¡Tu pedido está confirmado!');
  await p.waitForSelector('img[alt="Código QR del pedido confirmado"]', { visible: true });
  assert.match(await p.$eval('img[alt="Código QR del pedido confirmado"]', e => e.src), /^data:image\/png;base64,/, 'QR de alimentos visible');
  console.log('2. Alimentos: menú → reserva → cobro simulado → confirmación y QR');
  if (salida) await p.screenshot({ path: salida + '/alimentos.png' });

  await p.goto(CLIENTE + '/eventos/e0000001-0000-4000-8000-000000000001', { waitUntil: 'networkidle0' });
  await texto(p, 'HEXACORE Fest');
  await boton(p, 'Continuar al pago');
  await texto(p, 'Confirmar pago');
  await boton(p, 'Confirmar pago');
  await p.waitForFunction(() => location.pathname === '/entradas', { timeout: 20000 });
  await texto(p, 'Mis entradas');
  assert.ok(respuestas.some(r => r.url.endsWith('/turnos') && r.estado === 201));
  assert.ok(respuestas.some(r => /\/compras\/.+\/pagar$/.test(r.url) && r.estado < 300));
  console.log('3. Entradas: evento → turno de cola → reserva → pago → mis entradas');
  if (salida) await p.screenshot({ path: salida + '/entradas.png' });

  const admin = await pagina();
  await login(admin, ADMIN, 'admin@hexacore.com');
  await admin.goto(ADMIN + '/admin/cuentas', { waitUntil: 'networkidle0' });
  await texto(admin, 'cliente@hexacore.com');
  await admin.reload({ waitUntil: 'networkidle0' });
  await texto(admin, 'Cuentas de usuario');
  assert.ok(respuestas.some(r => r.url === '/api/v1/admin/cuentas' && r.estado === 200));
  console.log('4. Administración: login, cuentas reales y sesión tras recarga');
  if (salida) await admin.screenshot({ path: salida + '/administracion.png' });
  assert.deepEqual(errores, [], 'Errores JavaScript en las interfaces');
  assert.ok(!respuestas.some(r => r.estado >= 500), 'Error HTTP de backend');
  const registro = { recorridos: 4, errores, respuestas };
  if (salida) await writeFile(salida + '/navegador.json', JSON.stringify(registro, null, 2));
  console.log('OK: cuatro recorridos con Chrome real, sin peticiones al entorno habitual');
} finally {
  await navegador.close();
}
