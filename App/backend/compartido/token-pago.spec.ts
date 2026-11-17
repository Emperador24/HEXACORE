import { ValidationPipe } from '@nestjs/common';
import { CobrarDto } from '../modulos/finanzas/pagos/dto/pagos.dto';
import { CrearPagoDto } from '../modulos/alimentos/pagos/dto/crear-pago.dto';
import { PagarDto as Venta } from '../modulos/entradas/ventas/venta/dto/pagar.dto';
import { PagarDto as Reventa } from '../modulos/entradas/postventa/postventa/dto/pagar.dto';
import { PagarReservaDto } from '../modulos/parqueaderos/dto/parqueaderos.dto';
describe('RNF-05 DTO de cobro', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const casos = [
    [CobrarDto, 'token', { claveIdempotencia: 'seguridad-fixture', solicitante: 'alimentos', monto: 1000, moneda: 'COP', descripcion: 'Fixture' }],
    [CrearPagoDto, 'tokenPago', {}], [Venta, 'token', { metodoPago: 'TARJETA' }],
    [Reventa, 'token', { metodoPago: 'TARJETA' }], [PagarReservaDto, 'token', {}],
  ] as const;
  for (const [metatype, campo, resto] of casos) {
    it(`${metatype.name}/${campo}: rechaza PAN, CVV y objetos de tarjeta`, async () => {
      for (const dato of ['4111111111111111', '4111 1111 1111 1111', '999', '{"pan":"4111111111111111","cvv":"999"}']) {
        await expect(pipe.transform({ ...resto, [campo]: dato }, { type: 'body', metatype })).rejects.toThrow();
      }
    });
    it(`${metatype.name}/${campo}: acepta solo tokens y rechaza campos adicionales`, async () => {
      for (const token of ['tok_ok_seguridad', 'pm_sintetico123']) {
        await expect(pipe.transform({ ...resto, [campo]: token }, { type: 'body', metatype })).resolves.toBeDefined();
        await expect(pipe.transform({ ...resto, [campo]: token, cvv: '999' }, { type: 'body', metatype })).rejects.toThrow();
      }
    });
  }
});
