import { expect, test } from '@playwright/test';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/** CU-024 · Cobro y CU-025 · Control de ocupación del parqueadero del evento. */
test('CU-024 y CU-025 · Cobro y control de ocupación del parqueadero', async ({ page }) => {
  const { evento, sufijo } = datos();
  const zonaA = `Norte ${sufijo}`, zonaB = `Sur ${sufijo}`;
  const placa = (i: number) => `D${sufijo.slice(-3)}${i}`;
  const panelZona = (nombre: string) => page.locator('ul.zonas > li').filter({ hasText: nombre });
  const ingreso = async (p: string, zona?: string) => {
    await page.getByRole('textbox', { name: 'QR de la reserva o placa' }).fill(p);
    await elegir(page, 'Zona', zona ?? 'Recomendada');
    await page.getByRole('button', { name: 'Registrar ingreso' }).click();
    await expect(page.locator('.cobro .placa').filter({ hasText: p })).toBeVisible();
  };

  await paso(page, 'CU-024 · Tarifa centralizada', 'Solo el Administrador fija la tarifa por hora; aplica a las salidas desde ahora.', async () => {
    await entrarAdmin(page, ENTORNO.cuentas.administrador);
    await menu(page, 'Parqueaderos');
    await elegir(page, 'Evento', new RegExp(evento.nombre));
    await expect(page.getByText(/En vivo/)).toBeVisible();
    await page.getByRole('spinbutton', { name: 'Nueva tarifa' }).fill('6000');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('status')).toContainText('Tarifa actualizada');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  });

  await paso(page, 'Zonas del parqueadero', 'El organizador define dos zonas con su capacidad.', async () => {
    await entrarAdmin(page, ENTORNO.cuentas.organizador);
    await menu(page, 'Parqueaderos');
    await elegir(page, 'Evento', new RegExp(evento.nombre));
    // El panel llega por SSE; se espera a que esté en vivo para no escribir en un formulario que se va a redibujar.
    await expect(page.getByText(/En vivo/)).toBeVisible();
    for (const [nombre, capacidad] of [[zonaA, '3'], [zonaB, '10']]) {
      await page.getByRole('textbox', { name: 'Nueva zona' }).fill(nombre);
      await page.locator('.nueva-zona').getByRole('spinbutton', { name: 'Capacidad' }).fill(capacidad);
      await page.getByRole('button', { name: 'Agregar' }).click();
      await expect(panelZona(nombre)).toBeVisible();
    }
  });

  await paso(page, 'CU-025 · Pasos 1-2 · Ingresos', `Llegan tres vehículos a «${zonaA}»; la ocupación se actualiza al instante.`, async () => {
    for (const i of [1, 2, 3]) await ingreso(placa(i), zonaA);
    await expect(panelZona(zonaA)).toContainText('Llena');
  });

  await paso(page, 'CU-025A · Zona llena', 'La zona bloquea nuevos ingresos y la alerta propone a dónde redirigir.', async () => {
    const alerta = page.locator('ul.alertas > li').filter({ hasText: zonaA });
    await expect(alerta).toContainText('está llena');
    await expect(alerta).toContainText(zonaB);
  });

  await paso(page, 'CU-025 · Pasos 5-7 · Redirigir', `El supervisor redirige los ingresos de «${zonaA}» a «${zonaB}».`, async () => {
    await page.locator('ul.alertas > li').filter({ hasText: zonaA }).getByRole('button', { name: 'Redirigir' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('textbox', { name: 'Motivo' }).fill(`${zonaA} sin cupo`);
    await dialogo.getByRole('button', { name: 'Redirigir' }).click();
    await expect(page.getByText(/Vigente:/)).toContainText(zonaB);
    await ingreso(placa(4));
    await expect(page.locator('.cobro').filter({ hasText: placa(4) })).toContainText(zonaB);
  });

  await paso(page, 'CU-024 · Pasos 1-6 · Salida y cobro', 'Al salir se calcula la permanencia (redondeada hacia arriba) por la tarifa vigente.', async () => {
    await page.getByRole('textbox', { name: 'Placa o QR' }).fill(placa(1));
    await page.getByRole('button', { name: 'Registrar salida' }).click();
    const cobro = page.locator('.cobro').filter({ hasText: placa(1) }).filter({ hasText: 'Cobrar' });
    await expect(cobro).toContainText('$6.000');
    await expect(cobro).toContainText('1 h');
  });

  await paso(page, 'CU-025 · Paso 8 · Resultado de la redirección', 'Se anota el resultado y la recomendación vuelve a ser automática.', async () => {
    await page.getByRole('button', { name: 'Anotar resultado' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('textbox', { name: 'Motivo' }).fill(`Un vehículo llegó a ${zonaB}; ${zonaA} volvió a tener cupo`);
    await dialogo.getByRole('button', { name: 'Guardar y terminar' }).click();
    await expect(page.getByText(/Un vehículo llegó a/)).toBeVisible();
  });
});
