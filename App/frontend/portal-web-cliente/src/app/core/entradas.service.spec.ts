import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { EntradasService } from './entradas.service';
import { MetodoPago } from './models';
import { PagoService } from './pago.service';
import { Servidor } from './servidor';

describe('EntradasService HTTP (CU-003 y CU-004)', () => {
  let servicio: EntradasService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), {
      provide: AuthService, useValue: { conAcceso: (peticion: any) => firstValueFrom(peticion(new HttpHeaders({ Authorization: 'Bearer prueba' }))) }
    }] });
    servicio = TestBed.inject(EntradasService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('aplica el código en el servidor y recibe el total ya descontado (CU-004)', async () => {
    const respuesta = servicio.aplicarCupon('c1', '  HEXA10 ');
    const peticion = http.expectOne(`${Servidor.api}/compras/c1/cupon`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ codigo: 'HEXA10' });
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer prueba');
    peticion.flush({ id: 'c1', total: 144000, descuento: 16000, codigoPromocional: 'HEXA10' });
    expect((await respuesta).descuento).toBe(16000);
  });

  it('quita el código con DELETE (CU-004B)', async () => {
    const respuesta = servicio.quitarCupon('c1');
    const peticion = http.expectOne(`${Servidor.api}/compras/c1/cupon`);
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush({ id: 'c1', total: 160000, descuento: 0, codigoPromocional: null });
    expect((await respuesta).codigoPromocional).toBeNull();
  });

  it('cotiza sin cambiar nada y cancela con el monto que vio la persona (CU-003)', async () => {
    const cotizacion = servicio.cotizarCancelacion('c1', ['t1']);
    const pedida = http.expectOne(`${Servidor.api}/compras/c1/cancelacion/cotizacion`);
    expect(pedida.request.body).toEqual({ entradaIds: ['t1'] });
    pedida.flush({ montoReembolso: 57600, porcentajeReembolso: 80, mensaje: 'Se devuelve el 80 %.' });
    expect((await cotizacion).montoReembolso).toBe(57600);

    const cancelacion = servicio.cancelar('c1', ' No puedo ir ', 57600, ['t1']);
    const confirmada = http.expectOne(`${Servidor.api}/compras/c1/cancelaciones`);
    expect(confirmada.request.body).toEqual({ motivo: 'No puedo ir', montoAceptado: 57600, entradaIds: ['t1'] });
    confirmada.flush({ estado: 'APROBADA', mensaje: 'Reembolso aprobado.' });
    expect((await cancelacion).estado).toBe('APROBADA');
  });

  it('sin entradas elegidas cotiza la compra completa', async () => {
    const cotizacion = servicio.cotizarCancelacion('c1');
    const pedida = http.expectOne(`${Servidor.api}/compras/c1/cancelacion/cotizacion`);
    expect(pedida.request.body).toEqual({});
    pedida.flush({ montoReembolso: 1 });
    await cotizacion;
  });
});

describe('PagoService con código promocional (CU-004)', () => {
  it('resta el descuento que devolvió el servidor, sin calcularlo', async () => {
    TestBed.configureTestingModule({});
    const pago = TestBed.inject(PagoService);
    pago.registrar({
      titulo: 'Entradas',
      lineas: [{ etiqueta: 'General', cantidad: 2, precioUnitario: 80000 }],
      rutaDestino: '/entradas',
      metodos: [MetodoPago.TARJETA],
      onConfirmar: () => undefined,
      cupon: {
        aplicar: async () => ({ descuento: 16000, codigoPromocional: 'HEXA10' }),
        quitar: async () => ({ descuento: 0, codigoPromocional: null })
      }
    });
    expect(pago.total()).toBe(160000);

    await pago.cupon('aplicar', 'HEXA10');
    expect(pago.total()).toBe(144000);
    expect(pago.pendiente()?.codigoPromocional).toBe('HEXA10');

    await pago.cupon('quitar');
    expect(pago.total()).toBe(160000);
  });
});
