import type { ConfiguracionServicio } from './config/configuracion';
import { PasarelaStripe } from './pasarela-stripe.service';
import { ResultadoCobro } from './procesador-pagos';

/** Adaptador a Stripe: lo que se envía y cómo se traduce cada respuesta. */
describe('PasarelaStripe', () => {
  const config = (claveSecreta = 'sk_test_123') =>
    ({ pasarelaPagos: { timeoutMs: 5000, stripe: { url: 'https://api.stripe.test/v1', claveSecreta, clavePublica: 'pk_test_1', secretoWebhook: '' } } }) as ConfiguracionServicio;
  const cobro = (token = 'pm_123') => ({ monto: 85000, moneda: 'COP', token, descripcion: 'Reventa Concierto', claveIdempotencia: 'txn-1' });
  const responder = (status: number, cuerpo: object) =>
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(cuerpo), { status }));
  const enviado = (espia: jest.SpyInstance) => {
    const [url, opciones] = espia.mock.calls[0] as [string, RequestInit];
    return { url, cabeceras: opciones.headers as Record<string, string>, campos: Object.fromEntries(new URLSearchParams(opciones.body as string)) };
  };

  afterEach(() => jest.restoreAllMocks());

  it('cobra en centavos, confirma en la misma llamada y lleva la clave como Idempotency-Key y metadata', async () => {
    const espia = responder(200, { id: 'pi_1', status: 'succeeded' });

    await expect(new PasarelaStripe(config()).cobrar(cobro())).resolves.toEqual({ resultado: ResultadoCobro.APROBADO, referencia: 'pi_1', motivo: null });

    const { url, cabeceras, campos } = enviado(espia);
    expect(url).toBe('https://api.stripe.test/v1/payment_intents');
    expect(cabeceras).toMatchObject({ Authorization: 'Bearer sk_test_123', 'Idempotency-Key': 'txn-1' });
    expect(campos).toMatchObject({
      amount: '8500000', currency: 'cop', payment_method: 'pm_123', confirm: 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      'metadata[claveIdempotencia]': 'txn-1', 'metadata[operacion]': 'COBRO',
    });
  });

  it('CU-006G: una tarjeta rechazada (402) es RECHAZADO con un motivo legible', async () => {
    responder(402, { error: { type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds', payment_intent: { id: 'pi_2' } } });
    await expect(new PasarelaStripe(config()).cobrar(cobro())).resolves.toEqual({ resultado: ResultadoCobro.RECHAZADO, referencia: 'pi_2', motivo: 'Fondos insuficientes' });
  });

  it.each([
    ['un 5xx', () => responder(500, { error: { message: 'boom' } })],
    ['un 429', () => responder(429, { error: { message: 'despacio' } })],
    ['la red caída', () => jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'))],
    ['un estado intermedio', () => responder(200, { id: 'pi_3', status: 'processing' })],
  ])('CU-006I: %s es INDETERMINADO, nunca un rechazo', async (_caso, preparar) => {
    preparar();
    await expect(new PasarelaStripe(config()).cobrar(cobro())).resolves.toMatchObject({ resultado: ResultadoCobro.INDETERMINADO });
  });

  it('una tarjeta que pide 3-D Secure no se cobró: RECHAZADO', async () => {
    responder(200, { id: 'pi_4', status: 'requires_action' });
    await expect(new PasarelaStripe(config()).cobrar(cobro())).resolves.toMatchObject({ resultado: ResultadoCobro.RECHAZADO, referencia: 'pi_4' });
  });

  describe('tokens de la pasarela simulada (app móvil, pedidos, demos)', () => {
    it.each([
      ['tok_ok_demo', 'pm_card_visa'],
      ['tok_rechazo_demo', 'pm_card_chargeDeclined'],
      ['tok_noreemb_x', 'pm_card_visa'],
    ])('en modo de prueba, %s cobra con %s', async (token, metodo) => {
      const espia = responder(200, { id: 'pi_5', status: 'succeeded' });
      await new PasarelaStripe(config()).cobrar(cobro(token));
      expect(enviado(espia).campos.payment_method).toBe(metodo);
    });

    it('tok_timeout es INDETERMINADO sin llamar a Stripe', async () => {
      const espia = jest.spyOn(global, 'fetch');
      await expect(new PasarelaStripe(config()).cobrar(cobro('tok_timeout_demo'))).resolves.toMatchObject({ resultado: ResultadoCobro.INDETERMINADO });
      expect(espia).not.toHaveBeenCalled();
    });

    it('con llaves reales no se aceptan', async () => {
      const espia = jest.spyOn(global, 'fetch');
      await expect(new PasarelaStripe(config('sk_live_1')).cobrar(cobro('tok_ok_demo'))).resolves.toMatchObject({ resultado: ResultadoCobro.RECHAZADO });
      expect(espia).not.toHaveBeenCalled();
    });
  });

  it('CU-003: reembolsa sobre el PaymentIntent, en centavos y con su propia clave', async () => {
    const espia = responder(200, { id: 're_1', status: 'succeeded' });

    await expect(
      new PasarelaStripe(config()).reembolsar({ referenciaCobro: 'pi_1', monto: 42500, moneda: 'COP', motivo: 'Evento cancelado', claveIdempotencia: 'can-1' }),
    ).resolves.toEqual({ resultado: ResultadoCobro.APROBADO, referencia: 're_1', motivo: null });

    const { url, cabeceras, campos } = enviado(espia);
    expect(url).toBe('https://api.stripe.test/v1/refunds');
    expect(cabeceras['Idempotency-Key']).toBe('can-1');
    expect(campos).toMatchObject({ payment_intent: 'pi_1', amount: '4250000', 'metadata[operacion]': 'REEMBOLSO' });
  });

  it('un reembolso de un cobro ya devuelto es RECHAZADO', async () => {
    responder(400, { error: { type: 'invalid_request_error', code: 'charge_already_refunded' } });
    await expect(
      new PasarelaStripe(config()).reembolsar({ referenciaCobro: 'pi_1', monto: 1, moneda: 'COP', motivo: null as unknown as string, claveIdempotencia: 'can-2' }),
    ).resolves.toEqual({ resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'El cobro ya estaba reembolsado' });
  });
});
