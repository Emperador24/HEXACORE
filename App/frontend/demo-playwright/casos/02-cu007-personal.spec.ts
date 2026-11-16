import { expect, test } from '@playwright/test';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/** CU-007 · Gestión de personal: alta de la ficha y asignación a una zona del evento. */
test('CU-007 · Gestión de personal para eventos', async ({ page }) => {
  const { sufijo, cuentaEmpleado, eventoCartelera } = datos();
  const nombre = `Valeria Torres ${sufijo}`;
  const zona = `Tarima ${sufijo}`;
  const manana = new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 10);

  await paso(page, 'CU-007 · Gestión de personal', 'El administrador entra a Personal.', async () => {
    await entrarAdmin(page, ENTORNO.cuentas.administrador);
    await menu(page, 'Personal');
  });

  await paso(page, 'Pasos 1-2 · Cuenta del empleado', 'La ficha se vincula a una cuenta activa (CU-027).', async () => {
    await page.getByRole('button', { name: 'Nuevo empleado' }).click();
    await page.getByRole('textbox', { name: 'Nombre o correo de la cuenta' }).fill(cuentaEmpleado);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('listitem').filter({ hasText: cuentaEmpleado }).getByRole('button', { name: 'Elegir' }).click();
  });

  await paso(page, 'Pasos 3-4 · Datos del empleado', 'Documento y correo únicos, rol de trabajo y credencial QR/NFC.', async () => {
    await page.getByRole('textbox', { name: 'Nombre completo' }).fill(nombre);
    await page.getByRole('textbox', { name: 'Documento' }).fill(`10${Date.now().toString().slice(-8)}`);
    await page.getByRole('textbox', { name: 'Correo' }).fill(cuentaEmpleado);
    await page.getByRole('textbox', { name: 'Teléfono' }).fill('+57 310 555 0101');
    await page.getByRole('combobox', { name: 'Rol (área de trabajo)' }).fill('Seguridad');
    await page.getByRole('option', { name: 'Seguridad' }).click();
  });

  await paso(page, 'Paso 5 · Dar de alta', 'La ficha queda activa y ya puede recibir turnos.', async () => {
    await page.getByRole('button', { name: 'Dar de alta' }).click();
    await expect(page.getByRole('heading', { name: 'Turnos y asignaciones' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nombre completo' })).toHaveValue(nombre);
  });

  await paso(page, 'Paso 6 · Zona del evento', `Se crea la zona «${zona}» que pide dos personas de Seguridad.`, async () => {
    await menu(page, 'Personal');
    await page.getByRole('tab', { name: 'Asignación a eventos' }).click();
    await elegir(page, 'Evento', new RegExp(eventoCartelera.nombre));
    await page.getByRole('button', { name: 'Nueva zona' }).click();
    await page.getByRole('textbox', { name: 'Nombre' }).fill(zona);
    await page.getByRole('textbox', { name: 'Rol requerido' }).fill('Seguridad');
    await page.getByRole('spinbutton', { name: 'Personas' }).fill('2');
    await page.getByRole('button', { name: 'Crear zona' }).click();
    await page.getByRole('option', { name: new RegExp(zona) }).click();
  });

  await paso(page, 'Pasos 7-8 · Disponibilidad', 'Solo aparecen libres quienes tienen el rol y no se cruzan con otro turno.', async () => {
    await page.getByRole('textbox', { name: 'Fecha' }).fill(manana);
    await page.getByRole('textbox', { name: 'Desde' }).fill('16:00');
    await page.getByRole('textbox', { name: 'Hasta' }).fill('23:30');
    await page.getByRole('button', { name: 'Ver disponibles' }).click();
    await expect(page.getByRole('link', { name: nombre })).toBeVisible();
  });

  await paso(page, 'Paso 9 · Asignar', 'El empleado recibe el aviso y confirma desde la app; queda esperando respuesta.', async () => {
    await page.locator('li').filter({ has: page.getByRole('link', { name: nombre }) }).getByRole('button', { name: 'Asignar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Asignar' }).click();
    const fila = page.getByRole('row', { name: new RegExp(`${nombre}.*${zona}`) });
    await expect(fila).toContainText('Esperando respuesta');
  });
});
