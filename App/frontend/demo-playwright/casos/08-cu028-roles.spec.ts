import { expect, test } from '@playwright/test';
import { cuentaNueva } from '../apoyo/api';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { abrir, elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/**
 * CU-028 · Gestión de roles y permisos. Dos ventanas: el administrador cambia
 * la matriz y la persona con el rol la sufre en su sesión abierta, sin volver
 * a iniciar sesión (CU-028B).
 */
test('CU-028 · Roles y permisos', async ({ page, browser }) => {
  const { evento, sufijo } = datos();
  const rol = `Supervisor de parqueadero ${sufijo}`;
  const correo = await cuentaNueva(`Supervisora ${sufijo}`);
  const casilla = (permiso: string) => page.locator(`[data-permiso="${permiso}"] input`);

  await paso(page, 'CU-028 · Pasos 1-2 · Roles y matriz', 'El administrador ve los roles del sistema (fijos) y los propios con su matriz por módulo.', async () => {
    await entrarAdmin(page, ENTORNO.cuentas.administrador);
    await menu(page, 'Roles y permisos');
    await expect(page.locator('[data-rol="Administrador"]')).toContainText('Permisos fijos del sistema');
  });

  await paso(page, 'CU-028 · Pasos 3-5 · Rol nuevo', 'Crea un rol y marca leer en Parqueaderos y en Monitoreo. Sin ningún permiso no deja guardar.', async () => {
    await page.locator('[data-prueba="nuevo-rol"]').click();
    await page.locator('[data-prueba="nombre-rol"]').fill(rol);
    await expect(page.locator('[data-prueba="guardar-rol"]')).toBeDisabled();
    await casilla('parqueaderos:leer').check();
    await casilla('reportes:leer').check();
  });

  await paso(page, 'CU-028 · Pasos 6-8 · Guardar', 'El rol queda creado; el cambio se registra en el historial con el administrador.', async () => {
    await page.locator('[data-prueba="guardar-rol"]').click();
    await expect(page.getByRole('status')).toContainText(`Rol «${rol}» creado`);
    await expect(page.locator('.historial')).toContainText('Creó el rol');
  });

  await paso(page, 'Asignar el rol', `Se asigna a ${correo}, una cuenta de cliente que no tiene acceso a este portal.`, async () => {
    await page.locator('[data-prueba="correo-asignar"]').fill(correo);
    await page.locator('[data-prueba="asignar"]').click();
    await expect(page.locator('.asignados')).toContainText(correo);
  });

  const otra = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
  const supervisora = await otra.newPage();
  try {
    await paso(supervisora, 'Post-condición 1 · Hereda los permisos', 'La supervisora entra y solo ve los módulos de su rol: Monitoreo y Parqueaderos.', async () => {
      await abrir(supervisora, `${ENTORNO.portalAdmin}/login`);
      await supervisora.getByRole('textbox', { name: 'Correo' }).fill(correo);
      await supervisora.getByRole('textbox', { name: 'Contraseña' }).fill('una frase de paso para la demo');
      await supervisora.getByRole('button', { name: 'Ingresar' }).click();
      const secciones = supervisora.getByRole('navigation', { name: 'Secciones' });
      await expect(secciones.getByRole('link', { name: 'Parqueaderos', exact: true })).toBeVisible();
      await expect(secciones.getByRole('link', { name: 'Monitoreo', exact: true })).toBeVisible();
      await expect(secciones.getByRole('link', { name: 'Eventos', exact: true })).toHaveCount(0);
      await menu(supervisora, 'Parqueaderos');
      await elegir(supervisora, 'Evento', new RegExp(evento.nombre));
      await expect(supervisora.getByText(/En vivo/)).toBeVisible();
    });

    await paso(page, 'CU-028B · Restringir', 'El administrador le quita leer en Parqueaderos y guarda.', async () => {
      await casilla('parqueaderos:leer').uncheck();
      await page.locator('[data-prueba="guardar-rol"]').click();
      await expect(page.getByRole('status')).toContainText('ya los aplican');
    });

    await paso(supervisora, 'CU-028B · Sin reiniciar sesión', 'En la misma sesión, la siguiente consulta del parqueadero ya se rechaza.', async () => {
      await menu(supervisora, 'Monitoreo');
      await expect(supervisora.getByRole('alert')).toHaveCount(0);
      // Ni siquiera la lista de eventos del parqueadero se carga ya.
      await supervisora.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Parqueaderos', exact: true }).click();
      await expect(supervisora.getByRole('alert')).toContainText(/permiso de leer en parqueaderos/);
    });
  } finally {
    await otra.close();
  }

  await paso(page, 'CU-028A · Eliminar con usuarios', 'Un rol con usuarios activos no se elimina sin decir a qué rol pasan.', async () => {
    await page.locator(`[data-rol="${rol}"]`).click();
    await page.locator('[data-prueba="eliminar-rol"]').click();
    await expect(page.getByRole('alert')).toContainText('Elige a qué rol pasarlos');
  });

  await paso(page, 'CU-028A · Reasignar y eliminar', 'Sus usuarios pasan a «Cliente» en la misma operación, y queda auditado.', async () => {
    // La etiqueta flotante del campo tapa el selector: se abre por su disparador.
    await page.locator('[data-prueba="reasignar"]').click({ force: true });
    await page.getByRole('option', { name: 'Cliente', exact: true }).click();
    await page.locator('[data-prueba="eliminar-rol"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar rol' }).click();
    await expect(page.getByRole('status')).toContainText('1 usuarios pasaron a «Cliente»');
    await expect(page.locator(`[data-rol="${rol}"]`)).toHaveCount(0);
  });
});
