import { expect, test } from '@playwright/test';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/** CU-026 · Gestión de eventos: crear, publicar, editar y cancelar, con su historial. */
test('CU-026 · Gestión de eventos', async ({ page }) => {
  const { sufijo, recinto } = datos();
  const nombre = `Concierto Sinfónico ${sufijo}`;
  const fecha = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString().slice(0, 10);

  await paso(page, 'CU-026 · Gestión de eventos', 'El organizador entra al portal administrativo.', async () => {
    await entrarAdmin(page, ENTORNO.cuentas.organizador);
    await menu(page, 'Eventos');
  });

  await paso(page, 'Pasos 1-3 · Datos del evento', 'Nombre, categoría, artista, recinto, fecha, horario y aforo.', async () => {
    await page.getByRole('button', { name: 'Nuevo evento' }).click();
    await page.getByRole('textbox', { name: 'Nombre del evento' }).fill(nombre);
    await elegir(page, 'Categoría', 'Conciertos');
    await page.getByRole('textbox', { name: 'Artista o cabeza de cartel' }).fill('Orquesta Filarmónica de Bogotá');
    await page.getByRole('textbox', { name: 'Descripción' }).fill('Temporada de gala con obras de Beethoven y Brahms.');
    await elegir(page, 'Recinto', new RegExp(recinto.nombre));
    await page.getByRole('textbox', { name: 'Fecha' }).fill(fecha);
    await page.getByRole('textbox', { name: 'Hora de inicio' }).fill('20:00');
    await page.getByRole('textbox', { name: 'Hora de fin' }).fill('23:00');
    await page.getByRole('spinbutton', { name: 'Aforo máximo' }).fill('2000');
  });

  await paso(page, 'Paso 4 · Tipos de entrada', 'Cada localidad con su precio y sus cupos; no pueden superar el aforo.', async () => {
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Platea');
    await page.getByRole('spinbutton', { name: 'Precio (COP)' }).first().fill('180000');
    await page.getByRole('spinbutton', { name: 'Cupos' }).first().fill('1500');
    await page.getByRole('button', { name: 'Añadir tipo de entrada' }).click();
    await page.getByRole('textbox', { name: 'Nombre', exact: true }).nth(1).fill('Palco');
    await page.getByRole('spinbutton', { name: 'Precio (COP)' }).nth(1).fill('320000');
    await page.getByRole('spinbutton', { name: 'Cupos' }).nth(1).fill('400');
  });

  await paso(page, 'Paso 5 · Guardar como borrador', 'Se valida el horario contra el recinto (sin cruces) y queda en borrador.', async () => {
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page.getByText('Borrador').first()).toBeVisible();
  });

  await paso(page, 'Paso 6 · Publicar', 'Al publicarlo pasa a la cartelera y se avisa a Boletería.', async () => {
    await page.getByRole('button', { name: 'Publicar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText(/Publicado el/)).toBeVisible();
  });

  await paso(page, 'Editar un evento publicado', 'Se sube el precio del Palco; el cambio queda en el historial con su versión.', async () => {
    await page.getByRole('spinbutton', { name: 'Precio (COP)' }).nth(1).fill('350000');
    const guardar = page.getByRole('button', { name: /Guardar/ }).last();
    await guardar.click();
    // Guardado: el formulario deja de tener cambios pendientes.
    await expect(guardar).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Historial' })).toBeVisible();
  });

  await paso(page, 'CU-026B · Cancelar el evento', 'Pide el motivo; las compras se devolverán y el evento sale de la cartelera.', async () => {
    await page.getByRole('button', { name: 'Cancelar evento' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('textbox', { name: 'Motivo' }).fill('Cambio de agenda de la orquesta');
    await dialogo.getByRole('button', { name: 'Cancelar evento' }).click();
    await expect(page.getByText(/Cancelado el/)).toBeVisible();
  });

  await paso(page, 'Resultado', 'El evento aparece cancelado en la lista, con todo su historial.', async () => {
    await page.getByRole('link', { name: 'Eventos' }).first().click();
    await page.getByRole('textbox', { name: 'Buscar' }).fill(sufijo);
    await expect(page.getByRole('row', { name: new RegExp(nombre) })).toContainText('Cancelado');
  });
});
