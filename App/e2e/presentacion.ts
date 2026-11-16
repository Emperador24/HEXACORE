import { Browser, BrowserContext, Locator, Page, test } from '@playwright/test';

const navegadores = new WeakMap<Browser, number>();
const contextos = new WeakMap<BrowserContext, number>();
let siguienteNavegador = 0;
let siguienteContexto = 0;
const ultimaAccion = new WeakMap<Browser | Page, number>();

/** Acciones visibles en demo; normales/CI ejecutan la misma acción sin espera. */
export async function actuar<T extends Page | Locator, R>(objetivo: T, accion: (objetivo: T) => Promise<R>): Promise<R> {
  const info = test.info();
  if (info.config.metadata.demo !== true) return accion(objetivo);
  const page: Page = 'page' in objetivo ? (objetivo as Locator).page() : objetivo as Page;
  const navegador = page.context().browser() ?? page;
  // Antes de clics y campos, también al alternar contextos de dos actores.
  await page.bringToFront();
  const demora = Math.max(0, (info.config.metadata.accionMs as number) - (performance.now() - (ultimaAccion.get(navegador) ?? -Infinity)));
  if (demora > 0) await new Promise<void>(resolver => setTimeout(resolver, demora));
  try { return await accion(objetivo); }
  finally { ultimaAccion.set(navegador, performance.now()); }
}

/** Pausa de lectura; nunca sincroniza ni reintenta operaciones de negocio. */
export async function presentar(page: Page, etapa: string): Promise<void> {
  const info = test.info();
  if (info.config.metadata.demo !== true) return;
  const pausaMs = info.config.metadata.pausaMs as number;
  const contexto = page.context();
  const navegador = contexto.browser();
  if (!contextos.has(contexto)) contextos.set(contexto, ++siguienteContexto);
  if (navegador && !navegadores.has(navegador)) navegadores.set(navegador, ++siguienteNavegador);
  await test.step(`DEMO · ${etapa}`, async () => {
    await page.bringToFront();
    console.log(`[DEMO] ${etapa} · contexto ${contextos.get(contexto)} · lectura ${pausaMs} ms`);
    const inicio = performance.now();
    await new Promise<void>(resolver => setTimeout(resolver, pausaMs));
    // Solo títulos y tiempos: sin URL, claves, cuentas, tokens ni QR.
    await info.attach('demo-etapa', {
      body: Buffer.from(JSON.stringify({ etapa, navegador: navegador ? navegadores.get(navegador) : null,
        contexto: contextos.get(contexto), slowMoMs: info.config.metadata.slowMoMs,
        pausaMs, lecturaRealMs: Math.round(performance.now() - inicio) })),
      contentType: 'application/json',
    });
  });
}
