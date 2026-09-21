/**
 * Mercado secundario (CU-006) en el portal, de extremo a extremo: un Chrome de
 * verdad contra el backend real, sin datos simulados.
 *
 * Recorre el caso de uso completo con dos personas distintas, que es como
 * ocurre: Ana publica una entrada suya, Bruno la ve en el mercado, la reserva
 * —lo que la bloquea para todos los demás—, paga, y la entrada cambia de dueño
 * con un código QR nuevo.
 *
 * Necesita el backend (App/infra, perfil `servicios`) y el portal en marcha:
 *
 *   npm start                      # en otra terminal
 *   npm run test:reventa
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORTAL = 'http://localhost:4200';
const API = 'http://localhost:8080/api/v1';
const CAPTURAS = process.argv[2];
const DEMO = 'hexacore2026';
const VENDEDORA = 'cliente@hexacore.com';
const COMPRADOR = 'bruno@hexacore.com';

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--window-size=1280,860'],
  defaultViewport: { width: 1280, height: 860 }
});
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let pagina;

async function nueva() {
  // Contexto nuevo por persona: cada una con sus cookies, que es lo que hace
  // que la sesión de Ana no se mezcle con la de Bruno.
  const contexto = await navegador.createBrowserContext();
  pagina = await contexto.newPage();
  pagina.on('pageerror', (e) => console.log('   [error en la página]', e.message));
  return pagina;
}
async function ir(ruta) {
  await pagina.goto(PORTAL + ruta, { waitUntil: 'networkidle0' });
}
/**
 * Fija el valor de un campo, en vez de teclearlo.
 *
 * Teclear tiene una carrera con el autorrelleno del formulario de login, que en
 * desarrollo pone un correo de ejemplo: si el componente rellena justo después
 * de limpiar, lo tecleado se concatena y el login falla de forma intermitente.
 * Asignar por el `setter` del prototipo y disparar `input` es lo que Angular
 * necesita para enterarse, y no depende de cuándo llegue el autorrelleno.
 */
async function escribir(prueba, texto) {
  const sel = `[data-prueba="${prueba}"]`;
  await pagina.waitForSelector(sel, { visible: true });
  await pagina.$eval(
    sel,
    (elemento, valor) => {
      const asignar = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      asignar.call(elemento, valor);
      elemento.dispatchEvent(new Event('input', { bubbles: true }));
    },
    texto
  );
  const puesto = await pagina.$eval(sel, (e) => e.value);
  if (puesto !== texto) throw new Error(`el campo ${prueba} quedó en "${puesto}"`);
}
async function pulsar(prueba) {
  const sel = `[data-prueba="${prueba}"]`;
  await pagina.waitForSelector(sel, { visible: true });
  await pagina.click(sel);
}
async function hastaTexto(texto, ms = 12000) {
  await pagina.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, texto);
}
async function captura(nombre) {
  if (!CAPTURAS) return;
  await esperar(400);
  await pagina.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
}
async function login(email) {
  await ir('/login');
  await escribir('login-correo', email);
  await escribir('login-contrasena', DEMO);
  await pulsar('login-ingresar');
  try {
    await pagina.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 12000 });
  } catch (error) {
    // Sin esto, un login fallido solo dice «tiempo agotado» y hay que adivinar.
    const texto = await pagina.evaluate(() => document.body.innerText);
    throw new Error(`no se pudo entrar con ${email}. La página dice:\n${texto.slice(0, 300)}`);
  }
}

/** Consulta directa a la API, para comprobar lo que la pantalla no muestra. */
async function token(email) {
  const r = await fetch(`${API}/sesiones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, contrasena: DEMO })
  });
  return (await r.json()).token;
}
async function misEntradas(email) {
  const t = await token(email);
  const r = await fetch(`${API}/reventa/mis-entradas`, { headers: { Authorization: `Bearer ${t}` } });
  return r.json();
}

/**
 * Deja la base y los bloqueos en un estado conocido.
 *
 * Hace falta porque las demás pruebas de reventa venden estas mismas entradas:
 * sin resembrar, esta fallaría con «no hay ninguna entrada publicable» según el
 * orden en que se hayan corrido. Es lo mismo que hace `rnf01-concurrencia.py`.
 */
function resembrar() {
  const servicio = fileURLToPath(
    new URL('../../../services/entradas-mercado-secundario', import.meta.url)
  );
  execFileSync('npm', ['run', 'semilla'], { cwd: servicio, stdio: 'ignore', shell: true });
  // Los bloqueos de checkout viven en Redis y sobreviven al resembrado: una
  // publicación nueva con un bloqueo viejo encima no se podría reservar.
  const borrar = `local c=redis.call('scan',0,'match',ARGV[1],'count',1000) for _,k in ipairs(c[2]) do redis.call('del',k) end return 1`;
  execFileSync('redis-cli', ['-p', '6380', 'EVAL', JSON.stringify(borrar), '0', 'reventa:*'], {
    stdio: 'ignore',
    shell: true
  });
}

// --- 1. Ana publica una entrada suya (pasos 1-4) ---------------------------

console.log('### La vendedora publica una entrada');
resembrar();
console.log('  base resembrada');

const antesAna = await misEntradas(VENDEDORA);
const publicable = antesAna.find((e) => e.puedePublicarse);
assert.ok(publicable, 'la cuenta de ejemplo no tiene ninguna entrada publicable');

await nueva();
await login(VENDEDORA);
await ir('/entradas');
await hastaTexto('Mis entradas');
await hastaTexto(publicable.numeroTicket);
console.log(`  ${VENDEDORA} ve ${antesAna.length} entradas, incluida ${publicable.numeroTicket}`);

await pulsar('reventa-abrir-publicar');
await hastaTexto('Máximo permitido');
const precio = Math.min(publicable.precioMaximo, publicable.precioOriginal);
await escribir('reventa-precio', String(precio));
await captura('reventa-1-publicar');
await pulsar('reventa-publicar');
await hastaTexto('ya está en el mercado de reventa');
console.log(`  publicada en $${precio.toLocaleString('es-CO')}`);

// El estado cambió en el servidor, no solo en la pantalla.
const trasPublicar = await misEntradas(VENDEDORA);
const enReventa = trasPublicar.find((e) => e.id === publicable.id);
assert.equal(enReventa.estado, 'EN_REVENTA');
console.log('  el servidor la marca EN_REVENTA');
await captura('reventa-2-publicada');

// --- 2. Bruno la encuentra y la reserva (pasos 5-6) ------------------------

console.log('\n### El comprador la reserva');

await nueva();
await login(COMPRADOR);
await ir('/reventa');
await hastaTexto('Mercado de reventa');
await hastaTexto(publicable.eventoNombre);
console.log(`  ${COMPRADOR} ve la publicación de ${publicable.eventoNombre}`);

await pulsar('reventa-comprar');
await hastaTexto('Reservada para ti');
const textoReserva = await pagina.evaluate(() => document.body.innerText);
assert.match(textoReserva, /comisión/i, 'la reserva debe mostrar el desglose');
assert.match(textoReserva, /TXN-/, 'la reserva debe mostrar su número de transacción');
console.log('  reserva abierta, con cuenta atrás y desglose de comisión');
await captura('reventa-3-reserva');

// Mientras Bruno la tiene reservada, nadie más puede: el servidor lo impide.
const tc = await token('carla@hexacore.com');
const publicacionId = (
  await (await fetch(`${API}/reventa/publicaciones`, { headers: { Authorization: `Bearer ${tc}` } })).json()
).publicaciones.find((p) => p.entradaId === publicable.id)?.id;
if (publicacionId) {
  const intento = await fetch(`${API}/reventa/publicaciones/${publicacionId}/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tc}` }
  });
  assert.equal(intento.status, 409, 'una tercera persona no debe poder reservarla');
  const cuerpo = await intento.json();
  console.log(`  una tercera persona recibe ${intento.status} · ${cuerpo.codigo ?? ''}`);
}

// --- 3. Bruno paga (pasos 7-13) -------------------------------------------

console.log('\n### El comprador paga');

await pulsar('reventa-pagar');
await hastaTexto('La entrada ya es tuya');
const comprobante = await pagina.evaluate(() => document.body.innerText);
assert.match(comprobante, /HXC-QR-/, 'debe aparecer el código QR nuevo');
console.log('  comprobante con el código QR nuevo');
await captura('reventa-4-comprobante');

// --- 4. La propiedad cambió de verdad --------------------------------------

console.log('\n### La entrada cambió de dueño');

const finalAna = await misEntradas(VENDEDORA);
const finalBruno = await misEntradas(COMPRADOR);

assert.ok(
  !finalAna.some((e) => e.id === publicable.id),
  'la entrada ya no debe estar entre las de la vendedora'
);
const comprada = finalBruno.find((e) => e.id === publicable.id);
assert.ok(comprada, 'la entrada debe estar entre las del comprador');
assert.notEqual(comprada.numeroTicket, undefined);
console.log(`  ${VENDEDORA}: ${antesAna.length} -> ${finalAna.length} entradas`);
console.log(`  ${COMPRADOR}: ahora tiene ${comprada.numeroTicket}`);

await navegador.close();
console.log('\nOK — mercado secundario en el portal');
