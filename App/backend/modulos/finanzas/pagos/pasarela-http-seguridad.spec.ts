import { Logger } from '@nestjs/common';
import { PasarelaHttp } from './pasarela-http.service';
import { ConfiguracionServicio } from './config/configuracion';
import { ResultadoCobro } from './procesador-pagos';
import { PasarelaStripe } from './pasarela-stripe.service';

describe('RNF-05: respuesta no confiable del proveedor', () => {
  const canario = '4111111111111111 CVV=999'; // sintético, nunca se envía a un proveedor real
  const original = global.fetch;
  let mensajes: string[];
  const referencia = 'pas_11111111-1111-4111-8111-111111111111';
  const solicitud = { claveIdempotencia: 'seguridad-fixture', monto: 1000, moneda: 'COP', token: 'tok_ok_seguridad', descripcion: 'Fixture' };
  beforeEach(() => {
    mensajes = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(m => { mensajes.push(String(m)); });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(m => { mensajes.push(String(m)); });
  });
  afterEach(() => { global.fetch = original; jest.restoreAllMocks(); });
  function servicio() { return new PasarelaHttp({ pasarelaPagos: { url: 'http://proveedor.invalid', timeoutMs: 1000 } } as ConfiguracionServicio); }
  function comprobar(r: unknown) {
    expect(JSON.stringify(r)).not.toContain('4111111111111111');
    expect(JSON.stringify(r)).not.toContain('999');
    expect(mensajes.join('\n')).not.toContain('4111111111111111');
    expect(mensajes.join('\n')).not.toContain('999');
  }
  it.each([400, 500])('no registra cuerpos HTTP %i', async estado => {
    global.fetch = jest.fn().mockResolvedValue(new Response(canario, { status: estado }));
    const r = await servicio().cobrar(solicitud); comprobar(r);
    expect(r.resultado).toBe(estado === 400 ? ResultadoCobro.RECHAZADO : ResultadoCobro.INDETERMINADO);
  });
  it.each(['RECHAZADO', canario])('no propaga motivos ni estados arbitrarios: %s', async estado => {
    global.fetch = jest.fn().mockResolvedValue(Response.json({ estado, referencia, motivo: canario }));
    comprobar(await servicio().cobrar(solicitud));
  });
  it('no propaga mensajes de excepción', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error(canario));
    const r = await servicio().cobrar(solicitud); comprobar(r); expect(r.resultado).toBe(ResultadoCobro.INDETERMINADO);
  });
  it('no persiste una referencia que sea datos de tarjeta', async () => {
    global.fetch = jest.fn().mockResolvedValue(Response.json({ estado: 'APROBADO', referencia: canario }));
    const r = await servicio().cobrar(solicitud); comprobar(r); expect(r.resultado).toBe(ResultadoCobro.INDETERMINADO);
  });
  it('conserva referencias opacas de cobro y reembolso válidas', async () => {
    for (const ref of [referencia, referencia.replace('pas_', 'ree_')]) {
      global.fetch = jest.fn().mockResolvedValue(Response.json({ estado: 'APROBADO', referencia: ref }));
      expect(await servicio().cobrar(solicitud)).toEqual({ resultado: ResultadoCobro.APROBADO, referencia: ref, motivo: null });
    }
  });
  it('Stripe: tampoco propaga cuerpos, estados ni mensajes remotos', async () => {
    const s = new PasarelaStripe({ pasarelaPagos: { timeoutMs: 1000, stripe: { url: 'http://proveedor.invalid', claveSecreta: 'sk_test_sintetica' } } } as ConfiguracionServicio);
    for (const [estado, cuerpo] of [
      [402, { error: { message: canario, code: canario, payment_intent: { id: canario } } }],
      [500, { error: { message: canario } }],
      [200, { status: canario, id: canario }],
    ] as const) {
      global.fetch = jest.fn().mockResolvedValue(Response.json(cuerpo, { status: estado }));
      comprobar(await s.cobrar({ ...solicitud, token: 'pm_sintetico' }));
    }
    global.fetch = jest.fn().mockRejectedValue(new Error(canario));
    comprobar(await s.cobrar({ ...solicitud, token: 'pm_sintetico' }));
  });
});
