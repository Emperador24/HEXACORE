import { ValidationPipe } from '@nestjs/common';
import { NotificacionPasarelaDto } from './webhook.dto';
describe('RNF-05 webhook simulado', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const dto = { claveIdempotencia: 'seguridad-fixture', operacion: 'COBRO', resultado: 'RECHAZADO', referencia: 'pas_11111111-1111-4111-8111-111111111111', motivo: null };
  const transformar = (cambio: object) => pipe.transform({ ...dto, ...cambio }, { type: 'body', metatype: NotificacionPasarelaDto });
  it('acepta los motivos actuales del simulador y ausencia de motivo', async () => {
    for (const motivo of [null, 'Fondos insuficientes', 'No existe un cobro aprobado con esa referencia', 'El medio de pago no admite reembolsos', 'El reembolso supera lo cobrado']) {
      await expect(transformar({ motivo })).resolves.toBeDefined();
    }
  });
  it('rechaza texto remoto arbitrario y referencia con PAN', async () => {
    await expect(transformar({ motivo: '4111111111111111 CVV=999' })).rejects.toThrow();
    await expect(transformar({ referencia: '4111111111111111' })).rejects.toThrow();
  });
});
