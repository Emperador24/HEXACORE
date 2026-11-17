import { expect, test } from '@playwright/test';
import { llamar, sesion } from '../apoyo/api';
import { CUENTAS_DANIEL, entrarCliente, pagarEnPortal, proveedorPagos } from '../apoyo/cliente';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { abrir, elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/**
 * Parqueadero: CU-021 (reservar y pagar), CU-022 (ingreso por QR o placa) y
 * CU-023 (espacios y asignación), con la misma reserva. Un video por caso.
 *
 * Usa el evento de demostración de `preparar.ts` con dos zonas propias (por
 * API): así no choca con la zona que llena la demo de CU-024/025.
 */
let evento: { id: string; nombre: string };
let zonaA: string, zonaB: string, prefA: string, prefB: string, placaReserva: string, placaSinReserva: string;

test.describe.serial('Parqueadero · casos de uso de Daniel', () => {
  test.beforeAll(async () => {
    const d = datos();
    const corto = d.sufijo.slice(-3);
    evento = d.evento;
    [zonaA, zonaB] = [`Cubierta ${d.sufijo}`, `Descubierta ${d.sufijo}`];
    [prefA, prefB] = [`C${corto}`, `D${corto}`];
    [placaReserva, placaSinReserva] = [`RES${corto}`, `LLE${corto}`];

    // CU-024 es de Samuel: solo se fija una tarifa si todavía no hay ninguna.
    const admin = await sesion(ENTORNO.cuentas.administrador);
    const tarifa = await llamar<{ vigente: unknown }>(admin, 'GET', '/parqueaderos/tarifa');
    if (!tarifa.vigente) await llamar(admin, 'PUT', '/parqueaderos/tarifa', { valorHora: 5000, motivo: 'Demostración CU-021' });

    const organizador = await sesion(ENTORNO.cuentas.organizador);
    const zonas = await llamar<{ nombre: string }[]>(organizador, 'GET', `/parqueaderos/eventos/${evento.id}/zonas`);
    for (const [nombre, capacidad, prefijo] of [[zonaA, 6, prefA], [zonaB, 8, prefB]] as const) {
      if (!zonas.some((z) => z.nombre === nombre)) {
        await llamar(organizador, 'POST', `/parqueaderos/eventos/${evento.id}/zonas`, { nombre, capacidad, prefijo });
      }
    }
  });

  test('CU-021 · Reservar parqueadero', async ({ page }) => {
    const stripe = (await proveedorPagos()) === 'stripe';

    await paso(page, 'CU-021 · Reservar parqueadero', `${CUENTAS_DANIEL.cliente} reserva un espacio para «${evento.nombre}».`, async () => {
      await entrarCliente(page, CUENTAS_DANIEL.cliente);
      await abrir(page, `${ENTORNO.portalCliente}/parqueadero`);
      await elegir(page, 'Evento', new RegExp(evento.nombre));
      await expect(page.getByRole('radiogroup', { name: 'Zona' })).toBeVisible();
    });

    await paso(page, 'Pasos 2-5 · Zona y placa', 'Ve los espacios libres por zona y el precio hasta el final del evento.', async () => {
      await page.getByRole('radio', { name: new RegExp(zonaA) }).click();
      await page.getByRole('textbox', { name: 'Placa del vehículo' }).fill(placaReserva);
      await expect(page.getByText(/Total: \$/)).toBeVisible();
    });

    await paso(page, 'Paso 6 · Apartar el espacio', 'El espacio queda bloqueado unos minutos mientras paga.', async () => {
      await page.getByRole('button', { name: 'Continuar al pago' }).click();
      await expect(page).toHaveURL(/\/pago/);
    });

    await paso(page, 'CU-021B · Pago rechazado', stripe ? 'Stripe rechaza la tarjeta: no hay cargo y el espacio sigue apartado.' : 'La pasarela rechaza el pago: no hay cargo y el espacio sigue apartado.', async () => {
      await pagarEnPortal(page, false);
      await expect(page.getByRole('alert').filter({ hasText: /rechaz/i })).toBeVisible({ timeout: 30_000 });
    });

    await paso(page, 'Pasos 7-9 · Pagar', 'Pago aprobado: la reserva queda confirmada con su QR.', async () => {
      await pagarEnPortal(page, true);
      await expect(page).toHaveURL(/\/parqueadero/, { timeout: 30_000 });
    });

    await paso(page, 'Resultado', 'En «Mis reservas» aparece el espacio asignado y el QR para entrar.', async () => {
      await page.getByRole('tab', { name: 'Mis reservas' }).click();
      const reserva = page.locator('mat-card').filter({ hasText: placaReserva });
      await expect(reserva.locator('.codigo')).toBeVisible();
    });
  });

  test('CU-022 · Ingreso al parqueadero por QR o placa', async ({ page }) => {
    const cliente = await sesion(CUENTAS_DANIEL.cliente);
    const reservas = await llamar<{ placa: string; codigoQr: string | null; estado: string }[]>(cliente, 'GET', '/parqueaderos/reservas');
    const reserva = reservas.find((r) => r.placa === placaReserva && r.estado === 'CONFIRMADA');
    if (!reserva?.codigoQr) throw new Error(`No hay una reserva confirmada para ${placaReserva}: corre antes CU-021.`);
    const ingreso = async (texto: string, zona?: string) => {
      await page.getByRole('textbox', { name: 'QR de la reserva o placa' }).fill(texto);
      if (zona) await elegir(page, 'Zona', zona);
      await page.getByRole('button', { name: 'Registrar ingreso' }).click();
    };

    await paso(page, 'CU-022 · Punto de control', 'El personal del parqueadero registra cada vehículo que llega.', async () => {
      await entrarAdmin(page, ENTORNO.cuentas.organizador);
      await menu(page, 'Parqueaderos');
      await elegir(page, 'Evento', new RegExp(evento.nombre));
      await expect(page.getByText(/En vivo/)).toBeVisible();
    });

    await paso(page, 'Pasos 1-4 · Con reserva', 'Se escanea el QR de la reserva: va a su espacio y no paga al salir.', async () => {
      await ingreso(reserva.codigoQr!);
      const cobro = page.locator('.cobro').filter({ hasText: placaReserva });
      await expect(cobro).toContainText('Con reserva pagada');
    });

    await paso(page, 'CU-022 · Sin reserva', 'Llega un vehículo sin reserva: entra por la placa si hay cupo y paga al salir.', async () => {
      await ingreso(placaSinReserva, zonaB);
      await expect(page.locator('.cobro').filter({ hasText: placaSinReserva })).toContainText('Paga al salir');
    });

    await paso(page, 'Un vehículo no entra dos veces', 'Si la misma placa se registra otra vez, el sistema lo impide.', async () => {
      await ingreso(placaSinReserva, zonaB);
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByRole('alert').getByRole('button', { name: 'Cerrar' }).click();
    });
  });

  test('CU-023 · Espacios por zona y asignación', async ({ page }) => {
    await paso(page, 'CU-023 · Mapa de espacios', 'Cada zona muestra sus espacios: libres, reservados, ocupados o retirados.', async () => {
      await entrarAdmin(page, ENTORNO.cuentas.organizador);
      await menu(page, 'Parqueaderos');
      await elegir(page, 'Evento', new RegExp(evento.nombre));
      await expect(page.getByText(/En vivo/)).toBeVisible();
      await expect(page.locator('button.espacio.ocupado').filter({ hasText: `${prefA}-` }).first()).toBeVisible();
    });

    const libre = page.locator('button.espacio.libre').filter({ hasText: `${prefB}-` }).last();
    const codigo = (await libre.innerText()).trim();

    await paso(page, 'Cambiar el tipo de un espacio', `${codigo} pasa a ser para motos.`, async () => {
      await libre.click();
      // El tooltip del espacio se queda abierto con el mouse encima y tapa el selector.
      await page.mouse.move(0, 0);
      await elegir(page, 'Tipo', 'Moto');
      await expect(page.locator('button.espacio').filter({ hasText: codigo })).toContainText('two_wheeler');
    });

    await paso(page, 'Retirar un espacio', `${codigo} se retira (por obra, por ejemplo) y deja de asignarse.`, async () => {
      await page.getByRole('button', { name: 'Retirar espacio' }).click();
      await expect(page.locator('button.espacio.inactivo').filter({ hasText: codigo })).toBeVisible();
    });

    await paso(page, 'Liberar al salir', `${placaSinReserva} sale y su espacio vuelve a quedar libre.`, async () => {
      await page.getByRole('textbox', { name: 'Placa o QR' }).fill(placaSinReserva);
      await page.getByRole('button', { name: 'Registrar salida' }).click();
      await expect(page.locator('.cobro').filter({ hasText: placaSinReserva })).toContainText('liberado');
    });

    await paso(page, 'Paso 8 · Historial de asignaciones', 'Queda registrado quién ocupó cada espacio: reserva, ingreso y liberación.', async () => {
      const historial = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'Historial de asignaciones' }) });
      await expect(historial).toContainText(placaReserva);
      await expect(historial).toContainText(placaSinReserva);
      await expect(historial).toContainText('Liberado');
    });
  });
});
