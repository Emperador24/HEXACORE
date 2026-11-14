import { test as base, expect, BrowserContext, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export * from '@playwright/test';

// Optativo: misma suite, límites y aserciones, con evidencia privada adicional.
// Se instrumentan también los contextos explícitos de los recorridos multiusuario.
export const test = base.extend<{ evidenciaCsp: void }>({
  evidenciaCsp: [async ({ browser, context }, use, testInfo) => {
    if (process.env.HEXACORE_COMPROBAR_CSP !== '1') { await use(); return; }
    const violaciones: unknown[] = [], errores: string[] = [], consola: unknown[] = [];
    const contextos = new Set<BrowserContext>();
    const pagina = (p: Page) => {
      p.on('pageerror', e => errores.push(e.message));
      p.on('console', m => { if (['error', 'warning'].includes(m.type())) consola.push({ tipo: m.type(), texto: m.text() }); });
    };
    const instrumentar = async (c: BrowserContext) => {
      if (contextos.has(c)) return;
      contextos.add(c);
      await c.exposeBinding('__registrarCsp', (_fuente, dato) => { violaciones.push(dato); });
      await c.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', e => {
          (window as unknown as { __registrarCsp: (d: unknown) => void }).__registrarCsp({
            directiva: e.effectiveDirective, bloqueado: e.blockedURI, disposicion: e.disposition,
          });
        });
      });
      c.on('page', pagina); c.pages().forEach(pagina);
    };
    const nuevo = browser.newContext;
    browser.newContext = async opciones => { const c = await nuevo.call(browser, opciones); await instrumentar(c); return c; };
    try {
      await instrumentar(context);
      await use();
    } finally {
      browser.newContext = nuevo;
      const salida = resolve(testInfo.outputDir); mkdirSync(salida, { recursive: true });
      writeFileSync(resolve(salida, 'csp-consola-privada.json'), JSON.stringify({
        contextos: contextos.size, violaciones, errores, consola,
      }, null, 2), { mode: 0o600 });
    }
    expect(violaciones, 'Violaciones CSP durante el negocio').toEqual([]);
    expect(errores, 'Errores JavaScript durante el negocio').toEqual([]);
  }, { auto: process.env.HEXACORE_COMPROBAR_CSP === '1' }],
});
