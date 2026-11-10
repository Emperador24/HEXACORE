import { Page, expect, test } from '@playwright/test';
import { llamar, sesion } from '../apoyo/api';
import { ENTORNO } from '../apoyo/entorno';
import { paso } from '../apoyo/portal';

interface EntradaPropia { id: string; numeroTicket: string; eventoNombre: string; puedePublicarse: boolean; precioOriginal: number; precioMaximo: number | null }

/**
 * Una entrada de la vendedora que se pueda revender. Si ya las vendió todas en
 * corridas anteriores, le compra una en la venta primaria (CU-001): así la
 * demostración se repite sin volver a sembrar la base.
 */
async function entradaPublicable(): Promise<EntradaPropia> {
  const token = await sesion(ENTORNO.cuentas.vendedora);
  const buscar = async () => (await llamar<EntradaPropia[]>(token, 'GET', '/reventa/mis-entradas')).find((e) => e.puedePublicarse && e.precioMaximo);
  const existente = await buscar();
  if (existente) return existente;
  const { eventos } = await llamar<{ eventos: { id: string; pasado: boolean; agotado: boolean }[] }>(null, 'GET', '/cartelera');
  for (const evento of eventos.filter((e) => !e.pasado && !e.agotado)) {
    const detalle = await llamar<{ localidades: { id: string; disponibles: number }[] }>(null, 'GET', `/cartelera/${evento.id}`);
    const localidad = detalle.localidades.find((l) => l.disponibles > 0);
    if (!localidad) continue;
    const turno = await llamar<{ token: string | null }>(token, 'POST', `/cola/eventos/${evento.id}/turnos`, {});
    if (!turno.token) continue;
    const compra = await fetch(`${ENTORNO.api}/compras`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Turno-Cola': turno.token },
      body: JSON.stringify({ localidadId: localidad.id, cantidad: 1 }),
    }).then((r) => r.json());
    await llamar(token, 'POST', `/compras/${compra.id}/pagar`, { metodoPago: 'TARJETA', token: 'tok_ok_demo' });
    const nueva = await buscar();
    if (nueva) return nueva;
  }
  throw new Error(`${ENTORNO.cuentas.vendedora} no tiene entradas revendibles y no se pudo comprar una.`);
}

async function entrarCliente(page: Page, correo: string) {
  await page.context().clearCookies();
  await page.goto(`${ENTORNO.portalCliente}/login`);
  await page.locator('[data-prueba="login-correo"]').fill(correo);
  await page.locator('[data-prueba="login-contrasena"]').fill(ENTORNO.contrasena);
  await page.locator('[data-prueba="login-ingresar"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

const pesos = (n: number) => new RegExp(`\\$\\s?${Math.floor(n / 1000)}[.,]${String(n % 1000).padStart(3, '0')}(?!\\d)`);

/** CU-006 · Mercado secundario: Ana revende una entrada y Bruno la compra con un QR nuevo. */
test('CU-006 · Gestión del mercado secundario de entradas', async ({ page }) => {
  const entrada = await entradaPublicable();
  const maximo = Math.min(entrada.precioMaximo!, entrada.precioOriginal);
  // Un precio propio de esta corrida, para encontrar la publicación en el mercado.
  const precio = maximo - 1000 - (Date.now() % 997);
  const tarjeta = page.locator('mat-card').filter({ hasText: entrada.numeroTicket });

  await paso(page, 'CU-006 · Mercado secundario', `${ENTORNO.cuentas.vendedora} tiene la entrada ${entrada.numeroTicket} de «${entrada.eventoNombre}».`, async () => {
    await entrarCliente(page, ENTORNO.cuentas.vendedora);
    await page.goto(`${ENTORNO.portalCliente}/entradas`);
    await expect(tarjeta).toBeVisible();
  });

  await paso(page, 'Pasos 1-4 · Publicar', 'Se elige el precio, con el tope que evita la especulación.', async () => {
    await tarjeta.locator('[data-prueba="reventa-abrir-publicar"]').click();
    await expect(page.getByText('Máximo permitido')).toBeVisible();
    await page.locator('[data-prueba="reventa-precio"]').fill(String(maximo));
    await page.locator('[data-prueba="reventa-publicar"]').click();
    await expect(page.getByText('ya está en el mercado de reventa')).toBeVisible();
  });

  await paso(page, 'CU-006B · Retirar la publicación', 'La vendedora se arrepiente y la retira: vuelve a ser suya y sale del mercado.', async () => {
    await tarjeta.locator('[data-prueba="reventa-retirar"]').click();
    await expect(page.getByText('La entrada volvió a ser tuya')).toBeVisible();
  });

  await paso(page, 'Publicar de nuevo, más barata', `La vuelve a publicar por ${precio.toLocaleString('es-CO')} COP.`, async () => {
    await tarjeta.locator('[data-prueba="reventa-abrir-publicar"]').click();
    await page.locator('[data-prueba="reventa-precio"]').fill(String(precio));
    await page.locator('[data-prueba="reventa-publicar"]').click();
    await expect(page.getByText('ya está en el mercado de reventa')).toBeVisible();
  });

  const publicacion = page.locator('mat-card').filter({ hasText: entrada.eventoNombre }).filter({ hasText: pesos(precio) });

  await paso(page, 'Pasos 5-6 · Reservar', 'Bruno la encuentra y la reserva: queda bloqueada para los demás mientras paga.', async () => {
    await entrarCliente(page, ENTORNO.cuentas.comprador);
    await page.goto(`${ENTORNO.portalCliente}/reventa`);
    await publicacion.locator('[data-prueba="reventa-comprar"]').click();
    await expect(page.getByText('Reservada para ti')).toBeVisible();
    await expect(page.getByText(/comisión/i).first()).toBeVisible();
  });

  await paso(page, 'CU-006G · Pago rechazado', 'La pasarela rechaza la tarjeta: no hay cargo, la reserva termina y la entrada vuelve al mercado.', async () => {
    await page.getByRole('combobox', { name: 'Resultado a simular' }).click();
    await page.getByRole('option', { name: /rechazado/i }).click();
    await page.locator('[data-prueba="reventa-pagar"]').click();
    await expect(page.getByRole('alert')).toContainText(/rechaz/i);
    await expect(page.getByText('Reservada para ti')).toBeHidden();
  });

  await paso(page, 'Pasos 7-13 · Pagar y transferir', 'Bruno la reserva otra vez y paga: la entrada cambia de dueño y el QR anterior deja de valer.', async () => {
    await publicacion.locator('[data-prueba="reventa-comprar"]').click();
    await expect(page.getByText('Reservada para ti')).toBeVisible();
    await page.getByRole('combobox', { name: 'Resultado a simular' }).click();
    await page.getByRole('option', { name: /aprobado/i }).click();
    await page.locator('[data-prueba="reventa-pagar"]').click();
    await expect(page.getByText('La entrada ya es tuya')).toBeVisible();
    await expect(page.getByText(/HXC-QR-/).first()).toBeVisible();
  });

  await paso(page, 'Resultado', `${entrada.numeroTicket} ya es de ${ENTORNO.cuentas.comprador}, con un código QR nuevo.`, async () => {
    await page.goto(`${ENTORNO.portalCliente}/entradas`);
    await expect(page.locator('mat-card').filter({ hasText: entrada.numeroTicket })).toBeVisible();
  });
});
