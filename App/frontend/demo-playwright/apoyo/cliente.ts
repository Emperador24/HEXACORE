import { Page, expect } from '@playwright/test';
import { llamar } from './api';
import { ENTORNO } from './entorno';
import { PAUSA, abrir } from './portal';

/** Cuentas de los casos de uso de Daniel; fixtures públicos de los datos de demo. */
export const CUENTAS_DANIEL = {
  /** Compra, cancela y reserva parqueadero (CU-001 a CU-005, CU-021). */
  cliente: process.env.DEMO_CLIENTE || 'cliente@hexacore.com',
  /** Valida el QR en la puerta (CU-002), como lo hace la app del personal de ingreso. */
  personal: process.env.DEMO_PERSONAL || 'personal@hexacore.com',
};

/** Inicia sesión en el portal del cliente. */
export async function entrarCliente(page: Page, correo: string) {
  await page.context().clearCookies();
  await abrir(page, `${ENTORNO.portalCliente}/login`);
  await page.locator('[data-prueba="login-correo"]').fill(correo);
  await page.locator('[data-prueba="login-contrasena"]').fill(ENTORNO.contrasena);
  await page.locator('[data-prueba="login-ingresar"]').click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.waitForTimeout(PAUSA);
}

/** Qué pasarela está activa (RNF-16): con Stripe el portal muestra su formulario de tarjeta. */
export async function proveedorPagos(): Promise<'stripe' | 'simulada'> {
  return (await llamar<{ proveedor: 'stripe' | 'simulada' }>(null, 'GET', '/pagos/configuracion')).proveedor;
}

/**
 * Paga en la pantalla de pago del portal, aprobado o rechazado. Sirve con las
 * dos pasarelas: con la simulada elige el resultado de demostración; con Stripe
 * escribe una tarjeta de prueba en el formulario de Stripe (4242… aprueba,
 * 4000…0002 la rechaza el banco).
 */
export async function pagarEnPortal(page: Page, aprobado = true) {
  if ((await proveedorPagos()) === 'stripe') {
    const marco = page.locator('app-tarjeta-stripe iframe').first().contentFrame();
    await marco.locator('input[name="cardnumber"]').fill(aprobado ? '4242 4242 4242 4242' : '4000 0000 0000 0002');
    await marco.locator('input[name="exp-date"]').fill('12 / 30');
    await marco.locator('input[name="cvc"]').fill('123');
    const postal = marco.locator('input[name="postal"]');
    if (await postal.isVisible().catch(() => false)) await postal.fill('110111');
  } else {
    // `check()` comprueba que la opción quedó elegida: un clic suelto en el
    // mat-radio puede no cambiarla y el pago saldría con el resultado anterior.
    const opcion = page.getByRole('radio', aprobado ? { name: 'Pago aprobado', exact: true } : { name: /^Pago rechazado/ });
    await opcion.check();
    await expect(opcion).toBeChecked();
  }
  await page.getByRole('button', { name: 'Confirmar pago' }).click();
}

/** Una llamada que puede fallar a propósito (p. ej. CU-002D): devuelve estado y cuerpo sin lanzar. */
export async function intentar(token: string, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(ENTORNO.api + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  return { estado: r.status, cuerpo: (texto ? JSON.parse(texto) : null) as any };
}
