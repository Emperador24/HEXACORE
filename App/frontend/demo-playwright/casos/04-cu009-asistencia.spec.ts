import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { llamar, sesion } from '../apoyo/api';
import { datos } from '../apoyo/datos';
import { ENTORNO } from '../apoyo/entorno';
import { elegir, entrarAdmin, menu, paso } from '../apoyo/portal';

/**
 * CU-009 · Registrar ingreso y salida del personal. Los fichajes los hace el
 * lector de credenciales de la app; aquí llegan por la API con la hora del
 * dispositivo, y el supervisor ve en el portal la puntualidad de cada uno.
 */
test('CU-009 · Registrar ingreso y salida del personal', async ({ page }) => {
  const { empleados, evento } = datos();
  const [laura, andres, camila, julian] = empleados;
  const H = 3_600_000, M = 60_000;

  await paso(page, 'CU-009 · Asistencia', 'Cuatro empleados con turno desde hace dos horas fichan con su credencial en la puerta.', async () => {
    const token = await sesion(ENTORNO.cuentas.organizador);
    const inicio = Date.now() - 2 * H;
    for (const e of empleados) {
      await llamar(token, 'POST', '/logistica/turnos', {
        empleadoId: e.id, eventoId: evento.id, zona: 'Puerta Norte', horaInicio: new Date(inicio).toISOString(), horaFin: new Date(inicio + 5 * H).toISOString(),
      });
    }
    const fichar = (tipo: 'entrada' | 'salida', e: { credencial: string }, momento: number) =>
      llamar(token, 'POST', `/logistica/asistencia/${tipo}`, { credencial: e.credencial, eventoId: evento.id, clientTimestamp: new Date(momento).toISOString(), idempotencyKey: randomUUID() });
    await fichar('entrada', laura, inicio - 5 * M);    // puntual
    await fichar('entrada', andres, inicio + 25 * M);  // tarde
    await fichar('entrada', camila, inicio + 3 * M);   // dentro de la tolerancia
    await fichar('salida', camila, Date.now() - 20 * M); // se fue antes
    // Julián no ha llegado.
    await entrarAdmin(page, ENTORNO.cuentas.organizador);
    await menu(page, 'Personal');
    await page.getByRole('tab', { name: 'Asistencia' }).click();
  });

  await paso(page, 'Paso 5 · Reporte del evento', 'Quién está en turno, horas trabajadas, llegadas tarde y salidas anticipadas.', async () => {
    await elegir(page, 'Evento', new RegExp(evento.nombre));
    const fila = (e: { nombre: string }) => page.getByRole('row', { name: new RegExp(e.nombre) });
    await expect(fila(laura)).toContainText('En turno');
    await expect(fila(andres).getByRole('cell').nth(4)).toHaveText('1');
    await expect(fila(camila)).toContainText('Fuera de turno');
    await expect(fila(camila).getByRole('cell').nth(6)).toHaveText('1');
    await expect(fila(julian)).toContainText('Fuera de turno');
  });

  await paso(page, 'Resultado', 'Andrés llegó 25 min tarde; Camila salió antes; Julián todavía no ficha.', async () => {
    await expect(page.getByText('Llegadas tarde')).toBeVisible();
  });
});
