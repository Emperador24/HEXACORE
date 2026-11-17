import { expect, test } from '@playwright/test';
import { llamar, sesion } from '../apoyo/api';
import { CUENTAS_DANIEL, entrarCliente, intentar, pagarEnPortal, proveedorPagos } from '../apoyo/cliente';
import { ENTORNO } from '../apoyo/entorno';
import { abrir, narrar, paso } from '../apoyo/portal';

/**
 * Boletería: CU-005, CU-001 con CU-004, CU-002 y CU-003, en ese orden y con la
 * misma compra. Un video por caso de uso.
 *
 * Se usa «Noche de Rock Nacional» de los datos de demo porque el cupón ROCK20
 * es solo de ese evento: así se ve también un cupón válido.
 */
const EVENTO = 'Noche de Rock Nacional';

test.describe.serial('Boletería · casos de uso de Daniel', () => {
  let compra: { id: string; numeroCompra: string; eventoId: string };

  test('CU-005 · Consultar la cartelera de eventos', async ({ page }) => {
    const tarjeta = (nombre: string) => page.getByRole('heading', { name: nombre, exact: true }).first();

    await paso(page, 'CU-005 · Cartelera', 'Cualquier persona, sin iniciar sesión, ve los eventos próximos.', async () => {
      await abrir(page, `${ENTORNO.portalCliente}/eventos`);
      await expect(tarjeta(EVENTO)).toBeVisible();
    });

    await paso(page, 'Pasos 2-3 · Buscar', 'Busca por nombre o lugar.', async () => {
      await page.getByRole('searchbox', { name: 'Buscar eventos' }).fill('Rock');
      await expect(tarjeta(EVENTO)).toBeVisible();
      await expect(tarjeta('Salsa al Parque')).toBeHidden();
    });

    await paso(page, 'CU-005C · Sin resultados', 'Si nada coincide, la cartelera lo dice.', async () => {
      await page.getByRole('searchbox', { name: 'Buscar eventos' }).fill('Ópera en la Luna');
      await expect(page.getByText('Ningún evento encontrado.')).toBeVisible();
      await page.getByRole('searchbox', { name: 'Buscar eventos' }).fill('');
    });

    await paso(page, 'Filtros combinables', 'Categoría y ciudad se combinan: conciertos en Cali.', async () => {
      await page.getByRole('group', { name: 'Filtrar por categoría' }).getByRole('button', { name: 'Conciertos' }).click();
      await expect(tarjeta(EVENTO)).toBeVisible();
      await page.getByRole('group', { name: 'Filtrar por ciudad' }).getByRole('button', { name: 'Cali' }).click();
      await expect(tarjeta('Salsa al Parque')).toBeVisible();
      await expect(tarjeta(EVENTO)).toBeHidden();
      await page.getByRole('group', { name: 'Filtrar por ciudad' }).getByRole('button', { name: 'Todas las ciudades' }).click();
    });

    await paso(page, 'Pasos 4-8 · Detalle del evento', 'Lugar, fecha y el precio de cada localidad, con los cupos del momento.', async () => {
      await tarjeta(EVENTO).click();
      await expect(page.getByRole('heading', { level: 1, name: EVENTO })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Ubicación y precio' })).toBeVisible();
    });
  });

  test('CU-001 y CU-004 · Comprar entradas con código promocional', async ({ page }) => {
    await paso(page, 'CU-001 · Comprar entradas', `${CUENTAS_DANIEL.cliente} compra dos entradas para «${EVENTO}».`, async () => {
      await entrarCliente(page, CUENTAS_DANIEL.cliente);
      await abrir(page, `${ENTORNO.portalCliente}/eventos`);
      await page.getByRole('heading', { name: EVENTO, exact: true }).first().click();
      await expect(page.getByRole('heading', { level: 1, name: EVENTO })).toBeVisible();
    });

    await paso(page, 'Pasos 1-2 · Localidad y cantidad', 'Elige la localidad y la cantidad; el total lo calcula el servidor.', async () => {
      await page.locator('.fila-zona:not([disabled])').first().click();
      await page.getByRole('button', { name: 'Agregar una entrada' }).click();
      await expect(page.locator('.cantidad-valor')).toHaveText('2');
    });

    await paso(page, 'Pasos 3-4 · Fila virtual y reserva', 'Pasa por la fila virtual (ADR-15) y aparta los cupos mientras paga.', async () => {
      await page.getByRole('button', { name: /Continuar al pago/ }).click();
      await expect(page).toHaveURL(/\/pago/, { timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
    });

    const campo = page.locator('[data-prueba="cupon-codigo"]');
    const aplicar = page.locator('[data-prueba="cupon-aplicar"]');

    await paso(page, 'CU-004C · Código inválido', 'Un código que no existe se rechaza y el total no cambia.', async () => {
      await campo.fill('NOEXISTE');
      await aplicar.click();
      await expect(page.getByRole('alert')).toBeVisible();
    });

    await paso(page, 'CU-004 · Aplicar el cupón', 'ROCK20 es de este evento: el servidor recalcula el total con el descuento.', async () => {
      await campo.fill('ROCK20');
      await aplicar.click();
      await expect(page.getByText('Código ROCK20')).toBeVisible();
    });

    await paso(page, 'CU-004B · Quitar el cupón', 'La persona puede quitarlo; el total vuelve al original.', async () => {
      await page.getByRole('button', { name: 'Quitar' }).click();
      await expect(campo).toBeVisible();
      await campo.fill('ROCK20');
      await aplicar.click();
      await expect(page.getByText('Código ROCK20')).toBeVisible();
    });

    const stripe = (await proveedorPagos()) === 'stripe';
    await paso(page, 'CU-001C · Pago rechazado', stripe ? 'Con Stripe, una tarjeta que el banco rechaza: no hay cargo y la reserva sigue.' : 'La pasarela rechaza el pago: no hay cargo y la reserva sigue.', async () => {
      await pagarEnPortal(page, false);
      await expect(page.getByRole('alert').filter({ hasText: /rechaz/i })).toBeVisible({ timeout: 30_000 });
    });

    await paso(page, 'Pasos 5-8 · Pagar', stripe ? 'Paga con tarjeta de prueba en Stripe: se emiten las entradas con su QR.' : 'Pago aprobado: se emiten las entradas con su QR.', async () => {
      await pagarEnPortal(page, true);
      await expect(page).not.toHaveURL(/\/pago/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Mis compras' })).toBeVisible();
    });

    const token = await sesion(CUENTAS_DANIEL.cliente);
    compra = (await llamar<{ id: string; numeroCompra: string; eventoId: string }[]>(token, 'GET', '/compras'))[0];
    await paso(page, 'Resultado', `Compra ${compra.numeroCompra} pagada, con el descuento de ROCK20.`, async () => {
      await expect(page.locator(`[data-prueba="compra-${compra.numeroCompra}"]`)).toContainText('Pagada');
    });
  });

  test('CU-002 · Entradas con QR y validación en la puerta', async ({ page }) => {
    const tarjeta = page.locator(`[data-prueba="compra-${compra.numeroCompra}"]`);

    await paso(page, 'CU-002 · Mis entradas', `La compra ${compra.numeroCompra} tiene un QR por entrada.`, async () => {
      await entrarCliente(page, CUENTAS_DANIEL.cliente);
      await abrir(page, `${ENTORNO.portalCliente}/entradas`);
      await tarjeta.locator('[data-prueba="compra-ver"]').click();
      await expect(tarjeta.locator('code.codigo').first()).toContainText('HXC-QR-');
    });

    const cliente = await sesion(CUENTAS_DANIEL.cliente);
    const detalle = await llamar<{ entradas: { codigoQr: string; numeroTicket: string }[] }>(cliente, 'GET', `/compras/${compra.id}`);
    const entrada = detalle.entradas[0];
    const personal = await sesion(CUENTAS_DANIEL.personal);

    await paso(page, 'Pasos 2-10 · En la puerta', `La app del personal escanea ${entrada.numeroTicket}: el servidor valida y registra el ingreso.`, async () => {
      const r = await intentar(personal, 'POST', '/ingresos', { eventoId: compra.eventoId, codigoQr: entrada.codigoQr });
      expect(r.estado).toBe(200);
      await narrar(page, 'Ingreso autorizado', `${r.cuerpo.localidadNombre} · Ticket ${r.cuerpo.numeroTicket} · aforo ${r.cuerpo.asistentes}/${r.cuerpo.aforoMaximo}`);
    });

    await paso(page, 'CU-002D · QR ya usado', 'Si alguien intenta entrar otra vez con el mismo QR, se rechaza y se dice cuándo entró.', async () => {
      const r = await intentar(personal, 'POST', '/ingresos', { eventoId: compra.eventoId, codigoQr: entrada.codigoQr });
      expect(r.cuerpo.codigo).toBe('CU-002D');
      await narrar(page, 'NO puede ingresar · CU-002D', r.cuerpo.mensaje);
    });

    await paso(page, 'Resultado', 'En el portal la entrada aparece usada y su QR deja de mostrarse.', async () => {
      await page.reload();
      await tarjeta.locator('[data-prueba="compra-ver"]').click();
      await expect(tarjeta.getByText(`Ticket ${entrada.numeroTicket} · Usada`)).toBeVisible();
    });
  });

  test('CU-003 · Cancelar la compra con reembolso', async ({ page }) => {
    const tarjeta = page.locator(`[data-prueba="compra-${compra.numeroCompra}"]`);

    await paso(page, 'CU-003 · Cancelar', `La persona quiere cancelar la compra ${compra.numeroCompra}.`, async () => {
      await entrarCliente(page, CUENTAS_DANIEL.cliente);
      await abrir(page, `${ENTORNO.portalCliente}/entradas`);
      await expect(tarjeta).toBeVisible();
    });

    await paso(page, 'Pasos 2-4 · Cotización', 'El servidor dice cuánto devuelve según la política; la entrada usada no se reembolsa (CU-003D).', async () => {
      await tarjeta.locator('[data-prueba="compra-cancelar"]').click();
      await expect(page.getByText(/Reembolso:/)).toBeVisible();
      await expect(page.locator('.rechazada').first()).toBeVisible();
    });

    await paso(page, 'Pasos 5-9 · Confirmar', 'Con el motivo, se reembolsa por la pasarela y se anula la entrada.', async () => {
      await page.locator('[data-prueba="cancelacion-motivo"]').fill('No puedo asistir');
      await page.locator('[data-prueba="cancelacion-confirmar"]').click();
      await expect(page.getByRole('status')).toBeVisible({ timeout: 30_000 });
    });

    await paso(page, 'Resultado', 'La compra queda cancelada en parte: la entrada usada se conserva y la otra queda anulada.', async () => {
      await expect(tarjeta).toContainText('Cancelada en parte');
    });
  });
});
