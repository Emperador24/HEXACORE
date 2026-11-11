import { Page, expect, test } from '@playwright/test';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/** CU-010 · Gestionar evacuación ante emergencias: de la alerta al reporte final. */
test('CU-010 · Gestionar evacuación ante emergencias', async ({ page }) => {
  const { evento } = datos();
  const zona = (nombre: string) => page.locator('ul.zonas > li').filter({ hasText: nombre });
  const confirmar = async (p: Page, accion: string, motivo?: string) => {
    const dialogo = p.getByRole('dialog');
    if (motivo) await dialogo.getByRole('textbox', { name: 'Motivo' }).fill(motivo);
    await dialogo.getByRole('button', { name: accion }).click();
  };

  await paso(page, 'CU-010 · Evacuación', 'El supervisor abre Emergencias para el evento; el recinto ya tiene salidas y rutas.', async () => {
    await entrarAdmin(page, ENTORNO.cuentas.organizador);
    await menu(page, 'Emergencias');
    await elegir(page, 'Evento', new RegExp(evento.nombre));
  });

  await paso(page, 'Pasos 1-3 · Registrar la emergencia', 'Incendio en la Gramilla: evacuación parcial de nivel 1 (CU-010C).', async () => {
    await elegir(page, 'Tipo de emergencia', 'Incendio');
    await page.getByRole('textbox', { name: 'Ubicación' }).fill('Food court de la Gramilla');
    await elegir(page, 'Alcance', /Parcial/);
    await elegir(page, 'Zona afectada', 'Gramilla');
    await elegir(page, 'Nivel', /^1/);
    await page.getByRole('textbox', { name: 'Descripción (opcional)' }).fill('Humo en la cocina del puesto 4');
  });

  await paso(page, 'Pasos 4-6 · Propuesta', 'El sistema calcula zonas, rutas y personas a evacuar antes de avisar a nadie.', async () => {
    await page.getByRole('button', { name: 'Calcular propuesta' }).click();
    await expect(zona('Gramilla')).toBeVisible();
  });

  await paso(page, 'Pasos 7-9 · Activar y avisar', 'Los avisos salen por la cola de alta prioridad al personal de cada zona.', async () => {
    await page.getByRole('button', { name: 'Confirmar y avisar' }).click();
    await confirmar(page, 'Activar y avisar');
    await expect(page.getByRole('heading', { name: 'Finalizar' })).toBeVisible();
  });

  await paso(page, 'Paso 10 · Reporte del personal', 'El personal de la Gramilla reporta 120 personas por evacuar.', async () => {
    await zona('Gramilla').getByRole('spinbutton', { name: 'Personas' }).fill('120');
    await zona('Gramilla').getByRole('button', { name: 'Reportar' }).click();
    await expect(zona('Gramilla')).toContainText('120 por evacuar');
  });

  await paso(page, 'CU-010A · Salida bloqueada', 'Hay humo en el túnel 3: se bloquea la Salida Norte y la ruta pasa a la alternativa.', async () => {
    await page.locator('ul.salidas > li').filter({ hasText: 'Salida Norte' }).getByRole('button', { name: 'Bloquear' }).click();
    await confirmar(page, 'Bloquear salida', 'Humo en el túnel 3');
    await expect(page.locator('ul.salidas > li').filter({ hasText: 'Salida Norte' })).toContainText('Humo en el túnel 3');
  });

  await paso(page, 'Paso 11 · Escalar a nivel 2', 'El fuego se extiende: se suman las zonas vecinas de la Gramilla.', async () => {
    await page.getByRole('button', { name: /Escalar a nivel 2/ }).click();
    await confirmar(page, 'Escalar', 'El humo llega a la Tribuna Norte');
    await expect(zona('Tribuna Norte')).toBeVisible();
  });

  await paso(page, 'Paso 12 · Zonas evacuadas', 'Cada zona se marca evacuada cuando ya no queda nadie.', async () => {
    for (const nombre of ['Gramilla', 'Tribuna Norte', 'Tribuna Sur']) {
      const z = zona(nombre);
      if (await z.count() && await z.getByRole('button', { name: 'Evacuada' }).count()) {
        await z.getByRole('button', { name: 'Evacuada' }).click();
        await expect(z).toContainText('Evacuada');
      }
    }
  });

  await paso(page, 'Finalizar y reporte', 'Se cierra la evacuación y queda el reporte de auditoría con la bitácora.', async () => {
    await page.getByRole('textbox', { name: 'Observaciones' }).fill('Sin heridos. Bomberos controlaron el foco en 12 minutos.');
    await page.getByRole('button', { name: 'Finalizar y generar reporte' }).click();
    await expect(page.getByRole('status')).toContainText('Evacuación finalizada');
    await expect(page.getByRole('heading', { name: 'Bitácora' })).toBeVisible();
  });
});
