/**
 * Login del portal de clientes (CU-027) de extremo a extremo, en un Chrome de
 * verdad contra el backend real: registro, correo, activación, login, sesión
 * tras recargar, perfil, cambio de contraseña, sesión cerrada desde otro
 * dispositivo, recuperación, cerrar sesión, mensajes del servidor y tema.
 *
 * Necesita el backend (App/infra, perfil `servicios`) y el portal en marcha:
 *
 *   npm start                      # en otra terminal
 *   npm run test:login             # o: node pruebas/login-portal.mjs <carpeta de capturas>
 *
 * Usa el Chrome instalado (puppeteer-core no descarga navegador). Otra ruta:
 *   CHROME=/ruta/a/chrome npm run test:login
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const PORTAL = 'http://localhost:4200';
const API = 'http://localhost:8080/api/v1'; // API Gateway (ADR-02)
const BUZON = 'http://localhost:3098/correos';
const CAPTURAS = process.argv[2];
const DEMO = 'hexacore2026';

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--window-size=1280,860'],
  defaultViewport: { width: 1280, height: 860 }
});
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let pagina;

async function nueva() {
  const contexto = await navegador.createBrowserContext();
  pagina = await contexto.newPage();
  pagina.on('pageerror', (e) => console.log('   [error en la página]', e.message));
  return pagina;
}
async function ir(ruta) {
  await pagina.goto(PORTAL + ruta, { waitUntil: 'networkidle0' });
}
async function escribir(prueba, texto) {
  const sel = `[data-prueba="${prueba}"]`;
  await pagina.waitForSelector(sel, { visible: true });
  await pagina.$eval(sel, (e) => {
    e.value = '';
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pagina.type(sel, texto);
}
async function pulsar(prueba) {
  const sel = `[data-prueba="${prueba}"]`;
  await pagina.waitForSelector(sel, { visible: true });
  await pagina.click(sel);
}
async function hastaTexto(texto, ms = 10000) {
  await pagina.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, texto);
}
async function hastaRuta(prefijo, ms = 10000) {
  await pagina.waitForFunction((p) => location.pathname.startsWith(p), { timeout: ms }, prefijo);
}
async function captura(nombre) {
  if (!CAPTURAS) return;
  await esperar(400);
  await pagina.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
}
async function correo(para, asunto) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(`${BUZON}?para=${encodeURIComponent(para)}`)).json();
    const c = r.correos.find((x) => x.asunto.includes(asunto));
    if (c) return c;
    await esperar(250);
  }
  throw new Error(`no llegó el correo "${asunto}" a ${para}`);
}
async function login(email, contrasena) {
  await ir('/login');
  await escribir('login-correo', email);
  await escribir('login-contrasena', contrasena);
  await pulsar('login-ingresar');
}
const paso = (t) => console.log('  ' + t);

try {
  // ---------------------------------------------------------------- registro
  console.log('### Registro → correo → activación → login');
  await nueva();
  await ir('/login');
  assert.ok(await pagina.evaluate(() => document.documentElement.classList.contains('tema-oscuro')), 'oscuro por defecto');
  await captura('01-login-oscuro');
  await ir('/registro');
  await captura('02-registro-oscuro');

  const email = `web${Date.now()}@hexacore.com`;
  const contrasena = 'una frase de paso larga';
  await escribir('registro-nombre', 'Prueba Portal');
  await escribir('registro-correo', email);
  await escribir('registro-contrasena', contrasena);
  await escribir('registro-confirmacion', 'otra distinta');
  await pagina.click('[data-prueba="registro-terminos"] input');
  await pulsar('registro-crear');
  await hastaTexto('Las contraseñas no coinciden.');
  await escribir('registro-confirmacion', contrasena);
  await pulsar('registro-crear');
  await hastaRuta('/cuenta/verificar');
  await hastaTexto('te enviamos un enlace');
  await captura('03-revisa-tu-correo');
  paso('registro: pide confirmar igual la contraseña y lleva a "revisa tu correo"');

  const verificacion = await correo(email, 'Verifica tu cuenta');
  const enlace = /http\S+token=\S+/.exec(verificacion.texto)[0];
  assert.ok(enlace.startsWith(`${PORTAL}/cuenta/verificar?token=`), enlace);
  await pagina.goto(enlace, { waitUntil: 'networkidle0' });
  assert.equal(await pagina.evaluate(() => location.search), '', 'el token debe salir de la barra de direcciones');
  await hastaTexto('Activa tu cuenta');
  // Abrir el enlace no la activa sola: hace falta pulsar.
  await esperar(500);
  const pendiente = await (await fetch(`${API}/sesiones`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, contrasena })
  })).json();
  assert.equal(pendiente.codigo, 'CUENTA_NO_VERIFICADA');
  await captura('04-activa-tu-cuenta');
  await pulsar('verificar-activar');
  await hastaRuta('/login');
  await hastaTexto('quedó activada');
  paso('el enlace del correo abre el portal, quita el token de la URL y activa al pulsar');

  await escribir('login-correo', email);
  await escribir('login-contrasena', contrasena);
  await pulsar('login-ingresar');
  await hastaRuta('/eventos');
  await hastaTexto('Prueba Portal');
  paso('login: entra y el navbar muestra el nombre');

  // ------------------------------------------------------------- almacenamiento
  console.log('\n### Dónde quedan los tokens');
  const almacen = await pagina.evaluate(() => ({
    local: JSON.stringify(localStorage), sesion: JSON.stringify(sessionStorage), cookies: document.cookie
  }));
  assert.ok(!/ey[A-Za-z0-9_-]{10,}\./.test(almacen.local + almacen.sesion), 'ningún JWT en el almacenamiento');
  assert.ok(!almacen.cookies.includes('hxc_renovacion'), 'la cookie de renovación no es legible desde JS');
  const cookies = await pagina.cookies('http://localhost:3002/api/v1/sesiones/renovar');
  const cookie = cookies.find((c) => c.name === 'hxc_renovacion');
  assert.ok(cookie && cookie.httpOnly && cookie.sameSite === 'Strict' && cookie.path === '/api/v1/sesiones', JSON.stringify(cookie));
  paso(`localStorage: ${almacen.local} · cookie hxc_renovacion HttpOnly, SameSite=Strict, Path=${cookie.path}`);

  await pagina.reload({ waitUntil: 'networkidle0' });
  await hastaTexto('Prueba Portal');
  paso('al recargar, la sesión se recupera sola con la cookie');

  // -------------------------------------------------------------------- perfil
  console.log('\n### Perfil y ajustes (CU-027C)');
  await ir('/perfil');
  await captura('05-perfil-oscuro');
  await escribir('perfil-nombre', 'Prueba Portal Editada');
  await pulsar('perfil-guardar');
  await hastaTexto('Perfil guardado.');
  await hastaTexto('Prueba Portal Editada');
  paso('el nombre se guarda y el navbar lo refleja');

  await ir('/ajustes');
  await captura('06-ajustes-oscuro');
  await escribir('ajustes-actual', 'no es la actual');
  await escribir('ajustes-nueva', 'la nueva frase de paso');
  await escribir('ajustes-confirmacion', 'la nueva frase de paso');
  await pulsar('ajustes-guardar-contrasena');
  await hastaTexto('La contraseña actual no es correcta');
  await escribir('ajustes-actual', contrasena);
  await pulsar('ajustes-guardar-contrasena');
  await hastaTexto('Contraseña cambiada');
  paso('cambiar contraseña: rechaza la actual incorrecta y acepta la correcta');

  // ------------------------------------------------------ cerrada desde fuera
  console.log('\n### Sesión cerrada desde otro dispositivo');
  async function cambiarDesdeOtroDispositivo(actual, nueva) {
    const otra = await (await fetch(`${API}/sesiones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, contrasena: actual })
    })).json();
    const r = await fetch(`${API}/cuentas/perfil/contrasena`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otra.token}` },
      body: JSON.stringify({ contrasenaActual: actual, contrasenaNueva: nueva })
    });
    assert.equal(r.status, 200);
  }

  // a) Con la página abierta: la siguiente acción lo descubre.
  await cambiarDesdeOtroDispositivo('la nueva frase de paso', 'y otra frase de paso');
  await pagina.click('[data-prueba="shell-cuenta"]');
  await pagina.waitForSelector('.mat-mdc-menu-panel', { visible: true });
  await esperar(400); // la animación de apertura del menú
  for (const item of await pagina.$$('.mat-mdc-menu-item')) {
    if ((await item.evaluate((b) => b.innerText)).includes('Perfil')) {
      await item.click();
      break;
    }
  }
  await pagina.waitForSelector('.cdk-overlay-backdrop', { hidden: true });
  await hastaRuta('/perfil');
  await escribir('perfil-nombre', 'No debería guardarse');
  await pulsar('perfil-guardar');
  await hastaRuta('/login');
  await hastaTexto('Inicia sesión de nuevo');
  await captura('07-sesion-cerrada');
  paso('con la página abierta: la siguiente acción vuelve al login y dice por qué');

  // b) Con la página cerrada: al volver a abrirla también se explica.
  assert.ok((await pagina.evaluate(() => location.search)).includes('returnUrl=%2Fperfil'));
  await escribir('login-correo', email);
  await escribir('login-contrasena', 'y otra frase de paso');
  await pulsar('login-ingresar');
  await hastaRuta('/perfil');
  await pagina.waitForSelector('[data-prueba="shell-cuenta"]', { visible: true });
  paso('tras volver a entrar, regresa a donde estaba (returnUrl)');
  await cambiarDesdeOtroDispositivo('y otra frase de paso', 'la frase definitiva');
  await ir('/perfil');
  await hastaRuta('/login');
  await hastaTexto('Inicia sesión de nuevo');
  paso('al recargar tras el cierre: login con el aviso, no en silencio');
  // Y la cookie inservible ya no está: una segunda recarga es la de un visitante.
  await ir('/login');
  assert.ok(!(await pagina.evaluate(() => document.body.innerText.includes('Inicia sesión de nuevo'))), 'el aviso sale una sola vez');
  paso('el aviso sale una sola vez (la cookie inservible se borró)');

  await ir('/entradas');
  await hastaRuta('/login');
  paso('sin sesión, las rutas propias mandan al login');

  // ------------------------------------------------------------ recuperación
  console.log('\n### Recuperación de contraseña (CU-027A)');
  await ir('/login');
  await escribir('login-correo', email);
  await pagina.click('a[href^="/recuperar"]');
  await hastaRuta('/recuperar');
  assert.equal(await pagina.$eval('[data-prueba="recuperar-correo"]', (e) => e.value), email, 'lleva el correo del login');
  await pulsar('recuperar-enviar');
  await hastaTexto('Revisa tu correo');
  await captura('08-recuperar');
  const recuperacion = await correo(email, 'Restablece tu contraseña');
  const enlaceRecuperacion = /http\S+token=\S+/.exec(recuperacion.texto)[0];
  await pagina.goto(enlaceRecuperacion, { waitUntil: 'networkidle0' });
  assert.equal(await pagina.evaluate(() => location.search), '');
  await escribir('restablecer-nueva', 'frase recuperada larga');
  await escribir('restablecer-confirmacion', 'frase recuperada larga');
  await captura('09-restablecer');
  await pulsar('restablecer-guardar');
  await hastaRuta('/login');
  await hastaTexto('Ya puedes iniciar sesión con la nueva');
  await escribir('login-correo', email);
  await escribir('login-contrasena', 'frase recuperada larga');
  await pulsar('login-ingresar');
  await hastaRuta('/eventos');
  paso('enlace del correo → contraseña nueva → login con ella');

  // ------------------------------------------------------------- cerrar sesión
  await pagina.click('[data-prueba="shell-cuenta"]');
  await pagina.waitForSelector('.mat-mdc-menu-panel', { visible: true });
  await esperar(400);
  await pulsar('shell-cerrar-sesion');
  await hastaTexto('Iniciar sesión');
  await pagina.reload({ waitUntil: 'networkidle0' });
  await esperar(500);
  assert.ok(!(await pagina.evaluate(() => document.body.innerText.includes('Prueba Portal'))), 'tras cerrar sesión, recargar no la recupera');
  paso('cerrar sesión: recargar ya no la recupera (cookie borrada y sesión revocada)');

  // ------------------------------------------------------------ otros casos
  console.log('\n### Mensajes del servidor');
  await nueva();
  await login('bruno@hexacore.com', 'no es la contraseña');
  await hastaTexto('no son correctos');
  await captura('10-login-error');
  paso('contraseña equivocada: el mensaje del servidor');

  await login('pendiente@hexacore.com', DEMO);
  await hastaTexto('Todavía no confirmaste tu cuenta');
  await hastaTexto('Tengo el enlace de activación');
  paso('cuenta sin verificar: ofrece el enlace de activación');

  await login('admin@hexacore.com', DEMO);
  await hastaTexto('Este portal es para clientes');
  assert.ok(await pagina.evaluate(() => location.pathname === '/login'));
  paso('una cuenta sin rol Cliente no entra al portal');

  // --------------------------------------------------------------- tema claro
  console.log('\n### Tema claro, y que se recuerde');
  await login('cliente@hexacore.com', DEMO);
  await hastaRuta('/eventos');
  await hastaTexto('Ana');
  await captura('11-eventos-oscuro');
  for (const [ruta, nombre] of [['/entradas', '12-mis-entradas-oscuro'], ['/reventa', '13-reventa-oscuro'], ['/parqueadero', '14-parqueadero-oscuro'], ['/pedidos', '15-pedidos-oscuro']]) {
    await ir(ruta);
    await captura(nombre);
  }
  await ir('/eventos');
  await pulsar('shell-tema');
  await pagina.reload({ waitUntil: 'networkidle0' });
  assert.ok(!(await pagina.evaluate(() => document.documentElement.classList.contains('tema-oscuro'))), 'el tema claro se recuerda');
  await captura('16-eventos-claro');
  await ir('/ajustes');
  await captura('17-ajustes-claro');
  await pagina.click('[data-prueba="shell-cuenta"]');
  await pagina.waitForSelector('.mat-mdc-menu-panel', { visible: true });
  await esperar(400);
  await pulsar('shell-cerrar-sesion');
  await ir('/login');
  await captura('18-login-claro');
  paso('el interruptor cambia a claro y se conserva al recargar');

  console.log('\nOK — login del portal de clientes');
} catch (error) {
  if (pagina && CAPTURAS) await pagina.screenshot({ path: `${CAPTURAS}/fallo.png` });
  console.error('FALLO:', error.message);
  if (pagina) console.error('   en', pagina.url());
  process.exitCode = 1;
} finally {
  await navegador.close();
}
