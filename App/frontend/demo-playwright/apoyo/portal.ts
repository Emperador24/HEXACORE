import { Page, expect, test } from '@playwright/test';
import { ENTORNO } from './entorno';

/**
 * Cuánto se queda cada pantalla del flujo después de su paso: al menos 2 s,
 * para que se alcance a leer en la presentación y en el video. `DEMO_PAUSA`
 * puede alargarla, nunca bajarla de ese mínimo.
 */
const PAUSA_MINIMA = 2000;
export const PAUSA = Math.max(PAUSA_MINIMA, Number(process.env.DEMO_PAUSA ?? PAUSA_MINIMA));

/**
 * Un paso de la demostración: lo anuncia en pantalla (queda en el video) y en
 * el informe, y lo ejecuta.
 */
export async function paso<T>(page: Page, titulo: string, detalle: string, accion: () => Promise<T>): Promise<T> {
  return test.step(titulo, async () => {
    await narrar(page, titulo, detalle);
    const resultado = await accion();
    await page.waitForTimeout(PAUSA);
    return resultado;
  });
}

/** Rótulo fijo abajo a la derecha con el paso del caso de uso. */
export async function narrar(page: Page, titulo: string, detalle = '') {
  await page.evaluate(([t, d]) => {
    let caja = document.getElementById('demo-rotulo');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'demo-rotulo';
      caja.setAttribute('aria-hidden', 'true');
      caja.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:440px;padding:14px 18px;border-radius:14px;'
        + 'background:rgba(17,17,35,.92);color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:none';
      document.body.appendChild(caja);
    }
    caja.innerHTML = `<div style="font-weight:700;font-size:15px;margin-bottom:4px">${t}</div><div style="opacity:.85">${d}</div>`;
  }, [titulo, detalle]);
}

/** Inicia sesión en el portal administrativo. La sesión vive en memoria: se navega con el menú, nunca con `goto`. */
export async function entrarAdmin(page: Page, correo: string) {
  await page.goto(`${ENTORNO.portalAdmin}/login`);
  await page.getByRole('textbox', { name: 'Correo' }).fill(correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(ENTORNO.contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/admin\//);
  await page.waitForTimeout(PAUSA);
}

/** Abre una sección desde el menú lateral del portal administrativo. */
export async function menu(page: Page, seccion: string) {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: seccion, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Cada pantalla nueva se queda a la vista lo mismo que un paso.
  await page.waitForTimeout(PAUSA);
}

/** Elige una opción de un `mat-select` por su etiqueta. */
export async function elegir(page: Page, etiqueta: string | RegExp, opcion: string | RegExp) {
  await page.getByRole('combobox', { name: etiqueta }).click();
  await page.getByRole('option', { name: opcion }).first().click();
}

/** Abre una página directamente y la deja a la vista lo mismo que un paso. */
export async function abrir(page: Page, url: string) {
  await page.goto(url);
  await page.waitForTimeout(PAUSA);
}
