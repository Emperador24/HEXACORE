import { createHmac } from 'node:crypto';
import { ResultadoCobro, TipoOperacion } from '../../../modulos/finanzas/pagos';
import { firmaStripeValida, traducirEvento } from './stripe.controller';

/** Webhook de Stripe: firma y traducción de eventos. */
describe('Webhook de Stripe', () => {
  const secreto = 'whsec_prueba';
  const cuerpo = Buffer.from('{"type":"payment_intent.succeeded"}');
  const ahora = 1_800_000_000_000;
  const firmar = (t: number, datos = cuerpo, clave = secreto) =>
    `t=${t},v1=${createHmac('sha256', clave).update(`${t}.`).update(datos).digest('hex')}`;

  describe('firmaStripeValida', () => {
    it('acepta la firma de Stripe sobre "t.cuerpo"', () => {
      expect(firmaStripeValida(cuerpo, firmar(ahora / 1000), secreto, ahora)).toBe(true);
    });
    it('acepta si alguna de varias v1 coincide (rotación del secreto)', () => {
      const t = ahora / 1000;
      expect(firmaStripeValida(cuerpo, `t=${t},v1=${'0'.repeat(64)},${firmar(t).split(',')[1]}`, secreto, ahora)).toBe(true);
    });
    it.each([
      ['un cuerpo alterado', () => firmaStripeValida(Buffer.from('{}'), firmar(ahora / 1000), secreto, ahora)],
      ['otro secreto', () => firmaStripeValida(cuerpo, firmar(ahora / 1000, cuerpo, 'whsec_otro'), secreto, ahora)],
      ['una firma vieja (repetición)', () => firmaStripeValida(cuerpo, firmar(ahora / 1000 - 600), secreto, ahora)],
      ['la cabecera ausente', () => firmaStripeValida(cuerpo, undefined, secreto, ahora)],
      ['una cabecera malformada', () => firmaStripeValida(cuerpo, 'v1=abc', secreto, ahora)],
    ])('rechaza %s', (_caso, comprobar) => expect(comprobar()).toBe(false));
  });

  describe('traducirEvento', () => {
    const evento = (type: string, objeto: object) => ({ type, data: { object: { metadata: { claveIdempotencia: 'txn-1' }, ...objeto } } });

    it('un cobro aprobado', () => {
      expect(traducirEvento(evento('payment_intent.succeeded', { id: 'pi_1' }))).toEqual({
        claveIdempotencia: 'txn-1', operacion: TipoOperacion.COBRO, resultado: ResultadoCobro.APROBADO, referencia: 'pi_1', motivo: null,
      });
    });
    it('un cobro fallido', () => {
      expect(traducirEvento(evento('payment_intent.payment_failed', { id: 'pi_1', last_payment_error: { message: 'Your card was declined.' } })))
        .toMatchObject({ resultado: ResultadoCobro.RECHAZADO, motivo: 'Stripe rechazó la operación' });
    });
    it.each([
      ['succeeded', ResultadoCobro.APROBADO],
      ['failed', ResultadoCobro.RECHAZADO],
    ])('un reembolso en %s', (status, resultado) => {
      expect(traducirEvento(evento('refund.updated', { id: 're_1', status }))).toMatchObject({ operacion: TipoOperacion.REEMBOLSO, resultado, referencia: 're_1' });
    });
    it('ignora un reembolso pendiente, otros tipos y lo que no es de HEXACORE', () => {
      expect(traducirEvento(evento('refund.updated', { status: 'pending' }))).toBeNull();
      expect(traducirEvento(evento('customer.created', {}))).toBeNull();
      expect(traducirEvento({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_x', metadata: {} } } })).toBeNull();
    });
  });
});
