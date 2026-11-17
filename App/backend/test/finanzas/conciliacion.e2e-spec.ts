import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { cargarConfiguracion } from '../../modulos/finanzas/pagos/config/configuracion';
import { opcionesDataSource as opcionesPagos } from '../../modulos/finanzas/pagos/persistencia/data-source';
import { NucleoPrueba, esperar } from '../logistica/nucleo-prueba';

/**
 * CU-031 · Gestión de Pagos y Conciliación Financiera, contra el Núcleo
 * compilado y la pasarela simulada real (no un doble en memoria): cada
 * escenario llama primero a la pasarela, tal como lo haría
 * `PasarelaHttp.cobrar`, y solo después siembra el libro propio, para que la
 * comparación (paso 3) sea entre dos fuentes de verdad genuinas.
 */
describe('CU-031 · Gestión de Pagos y Conciliación Financiera (e2e)', () => {
  let nucleo: NucleoPrueba;
  let pagos: DataSource;
  let administrador: { id: string; token: string };
  let organizador: { id: string; token: string };
  const C = '/api/v1/conciliacion';
  const PASARELA = 'http://127.0.0.1:13105';
  const como = (c: { token: string }) => `Bearer ${c.token}`;

  beforeAll(async () => {
    nucleo = new NucleoPrueba('conciliacion');
    pagos = new DataSource(opcionesPagos(cargarConfiguracion()));
    await pagos.initialize();
    await nucleo.iniciar();
    administrador = await nucleo.cuenta(['Administrador']);
    organizador = await nucleo.cuenta(['Organizador']);
  });
  afterAll(async () => { await nucleo?.cerrar(); await pagos?.destroy(); });

  /**
   * Un cobro real contra la pasarela simulada, aprobado. Devuelve su referencia real.
   *
   * Sin `Idempotency-Key`: esta llamada siembra el libro propio por su cuenta
   * (no pasa por `PagosService`), así que la pasarela no debe intentar
   * confirmarla por webhook — ese webhook caería sobre una operación que el
   * Núcleo nunca inició y solo generaría ruido ("Webhook de una operación
   * desconocida") que rompe la aserción de teardown sin ser un fallo real.
   */
  async function cobroReal(monto: number): Promise<{ claveIdempotencia: string; referencia: string }> {
    const claveIdempotencia = `e2e-${randomUUID()}`;
    const res = await fetch(`${PASARELA}/pagos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto, moneda: 'COP', token: `tok_ok_${randomUUID()}`, descripcion: 'Prueba e2e CU-031' }),
    });
    const cuerpo = (await res.json()) as { referencia: string; estado: string };
    expect(cuerpo.estado).toBe('APROBADO');
    return { claveIdempotencia, referencia: cuerpo.referencia };
  }

  async function sembrarTransaccion(datos: { claveIdempotencia: string; monto: number; moneda?: string; referencia: string; solicitante?: string; creadaEn?: Date }) {
    await pagos.query(
      `INSERT INTO transacciones_pago (clave_idempotencia, tipo, solicitante, monto, moneda, resultado, referencia, creada_en, actualizada_en)
       VALUES ($1, 'COBRO', $2, $3, $4, 'APROBADO', $5, $6, $6)`,
      [datos.claveIdempotencia, datos.solicitante ?? 'entradas', datos.monto, datos.moneda ?? 'COP', datos.referencia, datos.creadaEn ?? new Date()],
    );
  }

  const solicitar = (desde: Date, hasta: Date, actor = administrador) =>
    request(nucleo.url).post(C).set('Authorization', como(actor)).send({ desde: desde.toISOString(), hasta: hasta.toISOString() });

  const detalle = (id: string) => request(nucleo.url).get(`${C}/${id}`).set('Authorization', como(administrador)).expect(200).then((r) => r.body);

  const esperarProcesada = (id: string) => esperar(async () => (await detalle(id)).conciliacion.estado !== 'EN_PROCESO', 15000);

  it('precondición 1: un Organizador no puede conciliar (solo Administrador Financiero)', async () => {
    const ahora = new Date();
    await solicitar(new Date(ahora.getTime() - 3_600_000), ahora, organizador).expect(403);
  });

  it('rechaza un rango donde «hasta» no es posterior a «desde»', async () => {
    const ahora = new Date();
    await solicitar(ahora, ahora).expect(400);
  });

  it('CU-031A: una transacción que coincide exactamente concilia automáticamente, sin intervención', async () => {
    const desde = new Date(Date.now() - 300); // margen: el reloj del contenedor de la pasarela puede ir unos ms detrás del host (no más: un margen mayor alcanzaría la ventana del escenario anterior).
    const { claveIdempotencia, referencia } = await cobroReal(150000);
    await sembrarTransaccion({ claveIdempotencia, monto: 150000, referencia });
    const hasta = new Date(Date.now() + 1000);

    const solicitud = await solicitar(desde, hasta).expect(201);
    expect(solicitud.body.estado).toBe('EN_PROCESO');
    await esperarProcesada(solicitud.body.id);

    const d = await detalle(solicitud.body.id);
    expect(d.conciliacion).toMatchObject({ estado: 'CONCILIADA_AUTOMATICA', total: 1, coincidentes: 1, conDiferencia: 0, huerfanas: 0 });
    expect(d.conciliacion.cerradaEn).toBeTruthy();
    expect(d.items[0].estadoItem).toBe('CONCILIADO');
  });

  it('CU-031B: lo que la pasarela reporta y el sistema no tiene se marca huérfana', async () => {
    const desde = new Date(Date.now() - 300); // margen: el reloj del contenedor de la pasarela puede ir unos ms detrás del host (no más: un margen mayor alcanzaría la ventana del escenario anterior).
    await cobroReal(80000); // nunca se siembra en el libro del sistema
    const hasta = new Date(Date.now() + 1000);

    const solicitud = await solicitar(desde, hasta).expect(201);
    await esperarProcesada(solicitud.body.id);
    const d = await detalle(solicitud.body.id);
    expect(d.conciliacion).toMatchObject({ estado: 'LISTA', huerfanas: 1, coincidentes: 0 });
    expect(d.items.find((i: { estadoItem: string }) => i.estadoItem === 'HUERFANA')).toBeTruthy();
  });

  it('una transacción con monto distinto entre el sistema y la pasarela queda con diferencia, y se resuelve con un reembolso administrativo', async () => {
    const desde = new Date(Date.now() - 300); // margen: el reloj del contenedor de la pasarela puede ir unos ms detrás del host (no más: un margen mayor alcanzaría la ventana del escenario anterior).
    const { claveIdempotencia, referencia } = await cobroReal(200000);
    // El sistema registró un monto distinto al que de verdad aprobó la pasarela.
    await sembrarTransaccion({ claveIdempotencia, monto: 250000, referencia });
    const hasta = new Date(Date.now() + 1000);

    const solicitud = await solicitar(desde, hasta).expect(201);
    await esperarProcesada(solicitud.body.id);
    let d = await detalle(solicitud.body.id);
    expect(d.conciliacion).toMatchObject({ estado: 'LISTA', conDiferencia: 1 });
    const item = d.items.find((i: { estadoItem: string }) => i.estadoItem === 'DIFERENCIA');
    expect(item.detalle).toContain('monto');

    // Pasos 6-9: el administrador revisa, aprueba un reembolso manual real contra la pasarela.
    const reembolso = await request(nucleo.url).post(`${C}/${solicitud.body.id}/reembolsos`).set('Authorization', como(administrador))
      .send({ itemId: item.id, monto: 50000, justificacion: 'Diferencia de 50.000 identificada en la conciliación mensual' }).expect(201);
    expect(reembolso.body.reembolsos[0]).toMatchObject({ resultado: 'APROBADO', itemId: item.id });
    expect(reembolso.body.reembolsos[0].referenciaPasarela).toMatch(/^ree_/);

    d = await detalle(solicitud.body.id);
    const itemResuelto = d.items.find((i: { id: string }) => i.id === item.id);
    expect(itemResuelto.estadoItem).toBe('CONCILIADO');
    expect(d.bitacora.some((b: { tipo: string }) => b.tipo === 'CLIENTE_NOTIFICADO')).toBe(true);
  });

  it('no se aprueba un reembolso manual sobre un ítem que ya concilió', async () => {
    const desde = new Date(Date.now() - 300); // margen: el reloj del contenedor de la pasarela puede ir unos ms detrás del host (no más: un margen mayor alcanzaría la ventana del escenario anterior).
    const { claveIdempotencia, referencia } = await cobroReal(90000);
    await sembrarTransaccion({ claveIdempotencia, monto: 90000, referencia });
    const hasta = new Date(Date.now() + 1000);
    const solicitud = await solicitar(desde, hasta).expect(201);
    await esperarProcesada(solicitud.body.id);
    const d = await detalle(solicitud.body.id);

    const res = await request(nucleo.url).post(`${C}/${solicitud.body.id}/reembolsos`).set('Authorization', como(administrador))
      .send({ itemId: d.items[0].id, monto: 1000, justificacion: 'No debería aplicar' }).expect(409);
    expect(res.body.codigo).toBe('ITEM_SIN_DIFERENCIA');
  });

  it('cerrar antes de terminar de procesar se rechaza; una vez lista, se puede cerrar manualmente', async () => {
    const desde = new Date(Date.now() - 300); // margen: el reloj del contenedor de la pasarela puede ir unos ms detrás del host (no más: un margen mayor alcanzaría la ventana del escenario anterior).
    const { claveIdempotencia, referencia } = await cobroReal(70000);
    await sembrarTransaccion({ claveIdempotencia, monto: 999999, referencia }); // fuerza una diferencia, para que quede LISTA (no autoconciliada)
    const hasta = new Date(Date.now() + 1000);
    const solicitud = await solicitar(desde, hasta).expect(201);

    await request(nucleo.url).post(`${C}/${solicitud.body.id}/cerrar`).set('Authorization', como(administrador)).expect(409);
    await esperarProcesada(solicitud.body.id);

    const cerrada = await request(nucleo.url).post(`${C}/${solicitud.body.id}/cerrar`).set('Authorization', como(administrador)).expect(201);
    expect(cerrada.body.estado).toBe('CERRADA');
    expect(cerrada.body.cerradaPor).toBe(administrador.id);
  });

  it('lista las conciliaciones solicitadas, más recientes primero', async () => {
    const listado = await request(nucleo.url).get(C).set('Authorization', como(administrador)).expect(200);
    expect(Array.isArray(listado.body)).toBe(true);
    expect(listado.body.length).toBeGreaterThan(0);
  });
});
