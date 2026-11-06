import { cobroDe } from './cobro.service';

/** CU-024, pasos 4-6: lo que ve el personal según cómo quedó la estancia. */
describe('cobroDe', () => {
  it('prepagada (CU-024A): sin cálculo, solo indica que ya está pagado', () => {
    expect(cobroDe({ prepagada: true, horasCobradas: null, valorHora: null, monto: null }))
      .toEqual({ prepagada: true, pendiente: false, horas: null, valorHora: null, monto: null, mensaje: 'El servicio ya está pagado.' });
  });

  it('sin tarifa vigente: la salida quedó registrada y el cobro pendiente', () => {
    expect(cobroDe({ prepagada: false, horasCobradas: null, valorHora: null, monto: null }))
      .toMatchObject({ pendiente: true, monto: null, mensaje: expect.stringMatching(/pendiente/) });
  });

  it('con tarifa: monto y desglose de un vistazo', () => {
    expect(cobroDe({ prepagada: false, horasCobradas: 3, valorHora: 4500, monto: 13500 }))
      .toEqual({ prepagada: false, pendiente: false, horas: 3, valorHora: 4500, monto: 13500, mensaje: 'Cobrar $13.500 (3 h × $4.500).' });
  });
});
