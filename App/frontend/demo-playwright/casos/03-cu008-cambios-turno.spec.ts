import { expect, test } from '@playwright/test';
import { llamar, sesion } from '../apoyo/api';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { entrarAdmin, menu, paso } from '../apoyo/portal';

/**
 * CU-008 · Cambios de turno. Las solicitudes nacen en la app del empleado;
 * aquí se crean por la API (el supervisor puede pedirlas en su nombre) y la
 * demostración es la revisión en el portal: aprobar con reemplazo y rechazar
 * con motivo (CU-008A), cada una con su historial.
 */
test('CU-008 · Gestionar cambios de turno', async ({ page }) => {
  const { sufijo, empleados, eventoCartelera } = datos();
  const [pide, rechazado, reemplazo] = empleados;
  const zona = `Puerta Sur ${sufijo}`;

  await paso(page, 'CU-008 · Cambios de turno', 'Dos empleados con turno asignado piden cambiarlo desde la app.', async () => {
    const token = await sesion(ENTORNO.cuentas.organizador);
    const inicio = new Date(Date.now() + 3 * 24 * 3_600_000);
    inicio.setHours(16, 0, 0, 0);
    const fin = new Date(inicio.getTime() + 6 * 3_600_000);
    for (const [empleado, motivo] of [[pide, 'Tengo un examen final ese día'], [rechazado, 'Prefiero no trabajar de noche']] as const) {
      const turno = await llamar(token, 'POST', '/logistica/turnos', {
        empleadoId: empleado.id, eventoId: eventoCartelera.id, zona, horaInicio: inicio.toISOString(), horaFin: fin.toISOString(),
      });
      await llamar(token, 'POST', `/logistica/turnos/${turno.id}/solicitudes-cambio`, { motivo });
    }
    await entrarAdmin(page, ENTORNO.cuentas.organizador);
    await menu(page, 'Personal');
    await page.getByRole('tab', { name: 'Cambios de turno' }).click();
    // Todas: así las solicitudes siguen a la vista después de aprobarlas o rechazarlas.
    await page.getByRole('group', { name: 'Filtrar por estado' }).getByRole('button', { name: 'Todas' }).click();
  });

  const solicitud = (empleado: { nombre: string }) =>
    page.locator('li').filter({ has: page.getByRole('button', { name: new RegExp(empleado.nombre) }) });

  await paso(page, 'Pasos 3-5 · Revisar la solicitud', `${pide.nombre} pide cambiar su turno; el sistema propone reemplazos del mismo rol y libres.`, async () => {
    await solicitud(pide).getByRole('button', { name: new RegExp(pide.nombre) }).click();
    await expect(page.getByText('Posibles reemplazos')).toBeVisible();
    await solicitud(pide).getByRole('radio', { name: new RegExp(reemplazo.nombre) }).check();
  });

  await paso(page, 'Paso 6 · Aprobar con reemplazo', `${reemplazo.nombre} cubre el turno y debe confirmarlo en la app.`, async () => {
    await page.getByRole('button', { name: new RegExp(`Aprobar con ${reemplazo.nombre}`) }).click();
    await expect(page.getByRole('status')).toContainText('Cambio aprobado');
  });

  await paso(page, 'CU-008A · Rechazar con motivo', `${rechazado.nombre} conserva su turno y recibe el motivo.`, async () => {
    await solicitud(rechazado).getByRole('button', { name: new RegExp(rechazado.nombre) }).click();
    await solicitud(rechazado).getByRole('button', { name: 'Rechazar' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('textbox', { name: 'Motivo' }).fill('No hay reemplazo con experiencia nocturna');
    await dialogo.getByRole('button', { name: 'Rechazar' }).click();
    await expect(solicitud(rechazado)).toContainText('Rechazada');
  });

  await paso(page, 'Historial', 'Cada solicitud guarda quién hizo qué y cuándo.', async () => {
    await solicitud(pide).getByRole('button', { name: new RegExp(pide.nombre) }).click();
    await expect(solicitud(pide).getByRole('heading', { name: 'Historial' })).toBeVisible();
    await expect(solicitud(pide)).toContainText('Aprobada');
  });
});
